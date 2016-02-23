var port = (process.env.VCAP_APP_PORT || 3000);
var host = (process.env.VCAP_APP_HOST || 'localhost');
var bodyParser = require("body-parser");
var express = require('express');
var request = require('request');
var Cloudant = require('cloudant');
var Config = require('config-js');
var json = require('json');
var config = new Config('./weather_config.js');
var me = config.get('CLOUDANT_USERNAME');
var password = config.get('CLOUDANT_PW');
var weatherAPIKey = config.get('API_KEY');
var triggerCallback = "http://nsds-api-stage.mybluemix.net/api/v1/trigger/";
var cron = require('cron');

var app = express();

var cloudant = Cloudant({account:me, password:password});

// lists all the databases on console

cloudant.db.list(function(err, allDbs){
	console.log("my dbs: %s", allDbs.join(','))
});


var recipesDB = cloudant.db.use('recipes');

app.use(bodyParser.json());
// app.use(express.json());
app.use(express.static(__dirname + '/public'));

// Check for appropriate values
// ingrediants look into 
// email digest loook into

app.post('/api/v1/weather/*', function(req, res){
	console.log("recipes was hit")
	/**
	1.) Store recipe in DB and return response
	2.) start cronJob
	*/
	var request = req.body;

	recipesDB.insert(request, function(err, body, header){
		var response = {};
		if(err){
			res.send("Error adding recipe.");
		}else{
			var idNum = body.id;
			res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
			var relation = request.trigger.relation;
			//sets up if recipe is calling for temperature monitoring
			if (relation == "tempLT" || relation == "tempGT" || relation=="EQ") {
				// Runs watch for Temperature every 4 hours at the start of the hour
				//var cronJob = cron.job("0 0 */4 * * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					watchTemperature(idNum);
				});
				cronJob.start();
			} else if (relation == "Alert") {
				//console.log("in alert")
				// Runs watch for weather advisories every 1 hour at the start of the hour
				//var cronJob = cron.job("0 0 */1 * * *", function() {
				var cronJob = cron.job("0 */1 * * * *", function(){
					watchAlert(idNum);
				});
				cronJob.start();
			} else if (relation == "currentWeather") {
				// Runs watch for weather every 1 hour at the start of the hour
				//var cronJob = cron.job("0 0 */1 * * *", function() {
				var cronJob = cron.job("0 */1 * * * *", function(){
					watchCurWeather(idNum);
				});
				cronJob.start();
			} else if (relation == "weatherChange") {
				// Runs watch for weather every 1 hour at the start of the hour
				//var cronJob = cron.job("0 0 */1 * * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					watchWeather(idNum);
				});
				cronJob.start();
			} else if (relation == "curForecast") {
				// Runs every day at 4 am
				//var cronJob = cron.job("0 0 4 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					todaysWeather(idNum);
				});
				cronJob.start();
			} else if (relation == "tomForecast") {
				// Runs every day at noon
				//var cronJob = cron.job("0 0 12 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					tomWeather(idNum);
				});
				cronJob.start();
			} else if (relation == "tomHtemp") {
				// Runs every day at noon
				//var cronJob = cron.job("0 0 12 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					tomHighTemp(idNum);
				});
				cronJob.start();
			} else if (relation == "tomLtemp") {
				// Runs every day at noon
				//var cronJob = cron.job("0 0 12 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					tomLowTemp(idNum);
				});
				cronJob.start();
			} else if (relation == "todHumid") {
				// Runs every day at 5 am
				//var cronJob = cron.job("0 0 5 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					todayHumid(idNum);
				});
				cronJob.start();
			} else if (relation == "todWind") {
				// Runs every day at 5 am
				//var cronJob = cron.job("0 0 5 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					todayWind(idNum);
				});
				cronJob.start();
			} else if (relation == "todUV") {
				// Runs every day at noon
				//var cronJob = cron.job("0 0 12 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					todayUV(idNum);
				});
				cronJob.start();
			} else if (relation == "todSunrise" || relation == "todSunset") {
				// Runs every day at noon
				//var cronJob = cron.job("0 0 12 */1 * *", function(){
				var cronJob = cron.job("0 */1 * * * *", function(){
					todaySun(idNum);
				});
				cronJob.start();
			}					
		}
	})	
});


/***********************

WATCH WEATHER FUNCTIONS

***********************/


// Takes recipe out of database with database key recipeIDnum
// Watches for if a temp goes below or above a value
function watchTemperature(recipeIDNum){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var targetTemp = data.trigger.watchNum;
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var type = data.trigger.numSystem;
			var thresh = data.trigger.inThreshold;
	
			// validates relation
			if(relation != "tempLT" && relation != "tempGT" && relation != "EQ"){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets the current temperature from response
					var parsedbody = JSON.parse(body);
					var currentTemp;
					if (type == "US") {
						currentTemp = parsedbody.current_observation.temp_f;
						console.log("current temp: " + currentTemp);
					} else {
						currentTemp = parsedbody.current_observation.temp_c;
						console.log("current temp: " + currentTemp);
					}
					// Does the appropriate comparison depending on the relation and stores a boolean
					// value in noise
					console.log("The watch temperature value: "+targetTemp);
					if (relation == "tempLT") {
						console.log("Relation: less than");
						// does LT relation
						if(currentTemp < targetTemp){
							if(thresh == false) {
								// changes threshold value to true
								data.trigger.inThreshold = true;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										res.send("Error adding recipe.");
									}
								});
								// calls callback url
								console.log("Target hit, calling callback URL...");
								callback += recipeIDNum;
								/*request(callback, function(err, response, body){
									if(!err){
										console.log("successfully sent trigger, response body:");
										console.log(body);
									}else{
										console.log(response);
										throw err;
									}
								});*/
							}
						} else if(thresh == true) {
							// if thresh = true than if temp difference is > 3 than threshold = false
							var tempDiff = currentTemp - targetTemp;
							if (tempDiff > 3) {
								data.trigger.inThreshold = false;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										res.send("Error adding recipe.");
									}
								});
							} 
						}
					} else if (relation == "tempGT") {
						// does GT relation
						console.log("Relation: greater than");
						if(currentTemp > targetTemp){
							if(thresh == false) {
								// changes threshold value to true
								data.trigger.inThreshold = true;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										res.send("Error adding recipe.");
									}
								});
								// calls callback url
								console.log("Target hit, calling callback URL...");
								callback += recipeIDNum;
								/*request(callback, function(err, response, body){
									if(!err){
										console.log("successfully sent trigger, response body:");
										console.log(body);
									}else{
										console.log(response);
										throw err;
									}
								});*/
							}
						} else if(thresh == true) {
							// if thresh = true than if temp difference is > 3 than threshold = false
							var tempDiff = targetTemp - currentTemp;
							if (tempDiff > 3) {
								data.trigger.inThreshold = false;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										res.send("Error adding recipe.");
									}
								});
							} 
						}
					} /*else if (relation == "EQ") {
						// does EQ relation
						if(currentTemp == targetTemp){
							console.log("Target hit, calling callback URL...");
							callback += recipeIDNum;
							request(callback, function(err, response, body){
								if(!err){
									console.log("successfully sent trigger, response body:");
									console.log(body);
								}else{
									console.log(response);
									throw err;
								}
							});
							noise = false;
						} else {
							noise = true;
						}
					}*/
				}else{
					console.log(response);
					throw err;
				}
		
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Watches for weather alerts
function watchAlert(recipeIDNum){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var thresh = data.trigger.prevCond;
	
			// validates relation
			if(relation != "Alert" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/alerts/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets the current alert description from response
					var parsedbody = JSON.parse(body);
					var currentAlert = parsedbody.alerts.description;
					console.log("current weather alerts: " + currentAlert);
					if (currentAlert === undefined) {
						//Do nothing if there is no alert description (meaning no alert)
						if (thresh != "none") {
							// changes threshold value to undefined
							data.trigger.prevCond = "none";
							recipesDB.insert(data, recipeIDNum, function(err, body, header){
								if(err){
									res.send("Error adding recipe.");
								}
							});
						}
					} else { 
					// if past alert is not the same as current alert set off trigger
						if ( thresh != currentAlert ) {
							//store new alert in json
							data.trigger.prevCond = currentAlert;
							recipesDB.insert(data, recipeIDNum, function(err, body, header){
								if(err){
									res.send("Error adding recipe.");
								}
							});
							// sets off trigger
							console.log("Target hit, calling callback URL...");
							callback += recipeIDNum;
							/*request(callback, function(err, response, body){
								if(!err){
									console.log("successfully sent trigger, response body:");
									console.log(body);
								}else{
									console.log(response);
									throw err;
								}
							});*/
						}
					}
				}else{
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Watches for a specific weather condition
function watchCurWeather(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var weatherCond = data.trigger.weather;
			var thresh = data.trigger.inThreshold;
	
			// validates relation
			if(relation != "currentWeather" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets the current alerts from response
					var parsedbody = JSON.parse(body);
					var curWeather = parsedbody.current_observation.weather;
					console.log("current weather: " + curWeather + "\n" + "Weather Condition: " + weatherCond);
					// checks if the current weather string contains the string
					// of the wanted condition
					var check = -1;
					if (weatherCond == "rain") {
						check = curWeather.search(/rain/i);
					} else if (weatherCond == "snow") {
						check = curWeather.search(/snow/i);
					} else if (weatherCond == "cloudy") {
						check = curWeather.search(/cloudy/i);
					} else if (weatherCond == "clear") {
						check = curWeather.search(/clear/i);
					}
					// if there is a match than set off trigger
					if ( check != (-1))  {
						if ( thresh == false) {
							// changes threshold value to true
							data.trigger.inThreshold = true;
							recipesDB.insert(data, recipeIDNum, function(err, body, header){
								if(err){
									res.send("Error adding recipe.");
								}
							});
							//calls callback url
							console.log("Target hit, calling callback URL...");
							callback += recipeIDNum;
							/*request(callback, function(err, response, body){
								if(!err){
									console.log("successfully sent trigger, response body:");
									console.log(body);
								}else{
									console.log(response);
									throw err;
									}
							});*/
						}
					} else if (thresh == true){
						// changes threshold value to false
						data.trigger.inThreshold = false;
						recipesDB.insert(data, recipeIDNum, function(err, body, header){
							if(err){
								res.send("Error adding recipe.");
							}
						});
					}
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Watches for a change in weather
function watchWeather(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var thresh = data.trigger.prevCond;
	
			// validates relation
			if(relation != "weatherChange" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets the current alerts from response
					var parsedbody = JSON.parse(body);
					var curWeather = parsedbody.current_observation.weather;
					console.log("Current weather: " + curWeather + ", Previous weather conditions: "+thresh);
					
					// if the current weather is different from the past weather set off trigger
					if ( curWeather != thresh)  {
						//update threshold with current weather for next check
						data.trigger.prevCond = curWeather;
						recipesDB.insert(data, recipeIDNum, function(err, body, header){
							if(err){
								res.send("Error adding recipe.");
							}
						});
						console.log("Target hit, calling callback URL...");
						callback += recipeIDNum;
						/*request(callback, function(err, response, body){
							if(!err){
								console.log("successfully sent trigger, response body:");
								console.log(body);
							}else{
								console.log(response);
								throw err;
							}
						});*/
					} 
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays weather forecast
function todaysWeather(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var type = data.trigger.numSystem;
	
			// validates relation
			if(relation != "curForecast" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/q/"
			requestURL += coord + ".json";

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets todays weather forecast
					var parsedbody = JSON.parse(body);
					var curWeather;
					if (type == "US") {
						curWeather = parsedbody.forecast.txt_forecast.forecastday[0].fcttext;
					} else {
						curWeather = parsedbody.forecast.txt_forecast.forecastday[0].fcttext_metric;
					}
					//Always sets off trigger
					console.log(curWeather);
					console.log("Target hit, calling callback URL...");
					callback += recipeIDNum;
					/*request(callback, function(err, response, body){
						if(!err){
							console.log("successfully sent trigger, response body:");
							console.log(body);
						}else{
							console.log(response);
							throw err;
						}
					});*/
				} else {
					console.log("ERROR:");
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets tomorrows weather forecast
function tomWeather(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var type = data.trigger.numSystem;
	
			// validates relation
			if(relation != "tomForecast" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var tomWeather;
					if (type == "US") {
						tomWeather = parsedbody.forecast.txt_forecast.forecastday[2].fcttext;
					} else {
						tomWeather = parsedbody.forecast.txt_forecast.forecastday[2].fcttext_metric;
					}
					//Always sets off trigger
					console.log(tomWeather);
					console.log("Target hit, calling callback URL...");
					callback += recipeIDNum;
					/*request(callback, function(err, response, body){
						if(!err){
							console.log("successfully sent trigger, response body:");
							console.log(body);
						}else{
							console.log(response);
							throw err;
						}
					});*/
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets tomorrows high temperature
function tomHighTemp(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var temp = data.trigger.watchNum;
			var type = data.trigger.numSystem;
	
			// validates relation
			if(relation != "tomHtemp" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets tomorrows weather 
					var parsedbody = JSON.parse(body);
					var tomHigh;
					if (type == "US") {
						tomHigh = parsedbody.forecast.simpleforecast.forecastday[1].high.fahrenheit;
					} else {
						tomHigh = parsedbody.forecast.simpleforecast.forecastday[1].high.celsius;
					}
					console.log("Is tomorrows high temp of "+tomHigh+" greater than "+temp);
					// If tomorrows High > x than set off trigger
					if (temp < tomHigh) {
						console.log("Target hit, calling callback URL...");
						callback += recipeIDNum;
						/*request(callback, function(err, response, body){
							if(!err){
								console.log("successfully sent trigger, response body:");
								console.log(body);
							}else{
								console.log(response);
								throw err;
							}
						});*/
					}
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets tomorrows low temperature
function tomLowTemp(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var temp = data.trigger.watchNum;
			var type = data.trigger.numSystem;
	
			// validates relation
			if(relation != "tomLtemp" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var tomLow;
					if (type == "US") {
						tomLow = parsedbody.forecast.simpleforecast.forecastday[1].low.fahrenheit;
					} else {
						tomLow = parsedbody.forecast.simpleforecast.forecastday[1].low.celsius;
					}
					console.log("Is tomorrows low temp of "+tomLow+" less than "+temp);
					// If tomorrows Low < x than set off trigger
					if (temp > tomLow) {
						console.log("Target hit, calling callback URL...");
						callback += recipeIDNum;
						/*request(callback, function(err, response, body){
							if(!err){
								console.log("successfully sent trigger, response body:");
								console.log(body);
							}else{
								console.log(response);
								throw err;
							}
						});*/
					}
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays max wind speed
function todayWind(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var windSpeed = data.trigger.watchNum;
			var type = data.trigger.numSystem;
	
			// validates relation
			if(relation != "todWind" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var maxWind;
					if (type == "US") {
						maxWind = parsedbody.forecast.simpleforecast.forecastday[1].maxwind.mph;
					} else {
						maxWind = parsedbody.forecast.simpleforecast.forecastday[1].maxwind.kph;
					}
					//direction is "".maxwind.dir if needed;
					console.log("Is tomorrows wind speed of "+maxWind+" greater than "+windSpeed);
					// If tomorrows Low < x than set off trigger
					if (maxWind > windSpeed) {
						console.log("Target hit, calling callback URL...");
						callback += recipeIDNum;
						/*request(callback, function(err, response, body){
							if(!err){
								console.log("successfully sent trigger, response body:");
								console.log(body);
							}else{
								console.log(response);
								throw err;
							}
						});*/
					}
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays max humidity
function todayHumid(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var humid = data.trigger.watchNum;
	
			// validates relation
			if(relation != "todHumid" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var maxHumid = parsedbody.forecast.simpleforecast.forecastday[1].maxhumidity;
					// If tomorrows Low < x than set off trigger
					console.log("Is tomorrows humidity of "+maxHumid+" greater than "+humid);
					if (maxHumid > humid) {
						console.log("Target hit, calling callback URL...");
						callback += recipeIDNum;
						/*request(callback, function(err, response, body){
							if(!err){
								console.log("successfully sent trigger, response body:");
								console.log(body);
							}else{
								console.log(response);
								throw err;
							}
						});*/
					}
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays max UV
function todayUV(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var uv = data.trigger.watchNum;
	
			// validates relation
			if(relation != "todUV" ){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var curUV = parsedbody.current_observation.UV;
					// If tomorrows Low < x than set off trigger
					console.log("Is tomorrows UV of "+curUV+" greater than "+uv);
					if (curUV > uv) {
						console.log("Target hit, calling callback URL...");
						callback += recipeIDNum;
						/*request(callback, function(err, response, body){
							if(!err){
								console.log("successfully sent trigger, response body:");
								console.log(body);
							}else{
								console.log(response);
								throw err;
							}
						});*/
					}
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays sunrise or sunset time
function todaySun(recipeIDNum) {
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			throw err;
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
	
			// validates relation
			if(relation != "todSunrise" && relation != "todSunset"){
				console.log("invalid comparison signal");
				return;
			}

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/astronomy/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);
			
			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, response, body){
				if(!err){
					// Gets todays sunrise or sunset
					var parsedbody = JSON.parse(body);
					var todaySunHour;
					var todaySunMin;
					if ("todSunrise" == relation) {
						todaySunHour = parsedbody.moon_phase.sunrise.hour;
						todaySunMin = parsedbody.moon_phase.sunrise.minute;
						console.log("Todays sunrise wil be at "+todaySunHour+":"+todaySunMin);
					} else {
						todaySunHour = parsedbody.moon_phase.sunset.hour;
						todaySunMin = parsedbody.moon_phase.sunset.minute;
						console.log("Todays sunset wil be at "+todaySunHour+":"+todaySunMin);
					}
					console.log("Target hit, calling callback URL...");
					callback += recipeIDNum;
					/*request(callback, function(err, response, body){
						if(!err){
							console.log("successfully sent trigger, response body:");
							console.log(body);
						}else{
							console.log(response);
							throw err;
						}
					});*/
				} else {
					console.log(response);
					throw err;
				}
			});
		}
	});
}


app.listen(port);

