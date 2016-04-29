var port = (process.env.VCAP_APP_PORT || 3000);
var host = (process.env.VCAP_APP_HOST || 'localhost');
var bodyParser = require("body-parser");
var express = require('express');
var request = require('request');
var Cloudant = require('cloudant');
var Config = require('config-js');
const fs = require('fs');
var json = require('json');
var config = new Config('./weather_config.js');
var me = config.get('CLOUDANT_USERNAME');
var password = config.get('CLOUDANT_PW');
var weatherAPIKey = config.get('API_KEY');
var onitAPIKey = config.get('nsdsApiKey');
var cron = require('cron');
var app = express();

var cloudant = Cloudant({account:me, password:password});
var recipesDB = cloudant.db.use('recipes');
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

		/*************

			INIT

		*************/
		
var allDocs = {"selector": { "_id": { "$gt": 0}}};
recipesDB.find(allDocs ,function(err, result){
	var eMsg;
	if (err) {
		eMsg = "Failed to access the database. \n" + err + "\n"+"\n" ;
		fs.appendFile('errorLog.txt', eMsg, function (err) {

		});
	} 
	console.log('Found %d JSONs at startup.', result.docs.length);
	for (var i = 0; i < result.docs.length; i++) {
		//Finds all recipes and only runs weather recipes
		var idNum = result.docs[i]._id;
		var relation = result.docs[i].trigger.relation;
		if (relation == "tempGT" || relation == "tempLT") {
			watchTemperature(idNum);
			
		} else	if (relation == "Alert") {
			watchAlert(idNum);
			
		} else if (relation == "currentWeather") {
			watchCurWeather(idNum);
			
		} else if (relation == "weatherChange") {
			watchWeather(idNum);
			
		} else if (relation == "curForecast") {
			todaysWeather(idNum);
			
		} else if (relation == "tomForecast") {
			tomWeather(idNum);
			
		} else if (relation == "tomHtemp") {
			tomHighTemp(idNum);

		} else if (relation == "tomLtemp") {
			tomLowTemp(idNum);
			
		} else if (relation == "todHumid") {
			todayHumid(idNum);
			
		} else if (relation == "todWind") {
			todayWind(idNum);
			
		} else if (relation == "todUV") {
			todayUV(idNum);
			
		} else if (relation == "todSunrise" || relation == "todSunset") {
			todaySun(idNum);
		}
	}
	console.log("The Weather Monitor is Up and Running.");
});

//temp
app.post('/temp/:recipeid', function(req, res){
	console.log("Callback has been reached.");
	console.log(req.body);
});
/***************

DELETE END POINT

****************/

app.delete('/api/v1/weather/:recipeid', function(req, res){
	var del_ID = req.params.recipeid;
	
	recipesDB.get(del_ID, function(err, data){
		if(err){
			res.json({success: false, msg: 'Failed to find the recipe in the database, please try again.'});
		} else {
			var rev = data._rev;
			recipesDB.destroy(del_ID, rev,  function(err) {
				if (!err) {
					res.json({success: true, msg: 'Successfully deleted the weather recipe from the database.'});
					//console.log("Successfully deleted doc"+ del_ID);
				} else {
					res.json({success: false, msg: 'Failed to delete recipe from the database, please try again.'});
				}
			});
		}
	});
});

/*************************

WEATHER TRIGGER END POINTS

*************************/

app.post('/api/v1/weather/temperatureGT', function(req, res){
	var request = req.body;
	request.trigger.relation = "tempGT";
	request.trigger.inThreshold = false;
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				//sets up if recipe is calling for temperature monitoring
				if (relation == "tempGT") {
					watchTemperature(idNum);
					
				} 					
			}
		})
	}
});
app.post('/api/v1/weather/temperatureLT', function(req, res){
	var request = req.body;
	request.trigger.relation = "tempLT";
	request.trigger.inThreshold = false;
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				//sets up if recipe is calling for temperature monitoring
				if (relation == "tempLT") {
					watchTemperature(idNum);
				} 				
			}
		})
	}
});

app.post('/api/v1/weather/alert', function(req, res){
	var request = req.body;
	request.trigger.relation = "Alert";
	request.trigger.prevCond = "";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "Alert") {
					watchAlert(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/specificWeather', function(req, res){
	var request = req.body;
	request.trigger.relation = "currentWeather";
	request.trigger.inThreshold = false;
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.weather != "snow" && request.trigger.weather != "rain" 
	&& request.trigger.weather != "cloudy" && request.trigger.weather != "clear") {
		res.json({success: false, msg: 'The weather was not submitted as either rain, snow, cloudy, or clear.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "currentWeather") {
					watchCurWeather(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/weatherChange', function(req, res){
	var request = req.body;
	request.trigger.relation = "weatherChange";
	request.trigger.prevCond = "";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "weatherChange") {
					watchWeather(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/currentForecast', function(req, res){
	var request = req.body;
	request.trigger.relation = "curForecast";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "curForecast") {
					todaysWeather(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/tomorrowForecast', function(req, res){
	var request = req.body;
	request.trigger.relation = "tomForecast";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "tomForecast") {
					tomWeather(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/tomorrowHighTemp', function(req, res){
	var request = req.body;
	request.trigger.relation = "tomHtemp";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "tomHtemp") {
					tomHighTemp(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/tomorrowLowTemp', function(req, res){
	var request = req.body;
	request.trigger.relation = "tomLtemp";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "tomLtemp") {
					tomLowTemp(idNum);
				} 				
			}
		})
	}
});

app.post('/api/v1/weather/todayHumidity', function(req, res){
	var request = req.body;
	request.trigger.relation = "todHumid";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "todHumid") {
					todayHumid(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/todayWind', function(req, res){
	var request = req.body;
	request.trigger.relation = "todWind";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else if (request.trigger.numSystem != "US" && request.trigger.numSystem != "M") {
		res.json({success: false, msg: 'The numSystem submitted was not US or M.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "todWind") {
					todayWind(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/todayUV', function(req, res){
	var request = req.body;
	request.trigger.relation = "todUV";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "todUV") {
					todayUV(idNum);
				} 					
			}
		})
	}
});

app.post('/api/v1/weather/todaySunrise', function(req, res){
	var request = req.body;
	request.trigger.relation = "todSunrise";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	}  else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "todSunrise" ) {
					todaySun(idNum);
				}					
			}
		})
	}
});

app.post('/api/v1/weather/todaySunset', function(req, res){
	var request = req.body;
	request.trigger.relation = "todSunset";
	
	if(request.callbackURL == "") {
		res.json({success: false, msg: 'No callbackURL submitted.'});
	} else {

		recipesDB.insert(request, function(err, body, header){
			if(err){
				res.json({success: false, msg: 'Failed to add the weather recipe to database.'});
			}else{
				var idNum = body.id;
				res.json({success: true, msg: 'Successfully added the weather recipe to database.'});
				var relation = request.trigger.relation;
				
				if (relation == "todSunset") {
					todaySun(idNum);
				}					
			}
		})
	}
});


/***********************

WATCH WEATHER FUNCTIONS

***********************/


// Takes recipe out of database with database key recipeIDnum
// Watches for if a temp goes below or above a value
function watchTemperature(recipeIDNum){
	var eMsg;
	// Runs watch for Temperature every 4 hours at the start of the hour
	//var cronJob = cron.job("0 0 */4 * * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
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
			var currentTemp;

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, resp, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets the current temperature from response
					var parsedbody = JSON.parse(body);
					if (type == "US") {
						currentTemp = parsedbody.current_observation.temp_f;
					} else {
						currentTemp = parsedbody.current_observation.temp_c;
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.current_observation.observation_time,
							"weather_temperature": currentTemp
						}
					};
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
			
					// Does the appropriate comparison depending on the relation and stores a boolean
					// value in noise
					//console.log("The watch temperature value: "+targetTemp);
					if (relation == "tempLT") {
						// does LT relation
						if(currentTemp < targetTemp){
							if(thresh == false) {
								// changes threshold value to true
								data.trigger.inThreshold = true;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (err) {

										});
									}
								});
								console.log("Target hit, calling callback URL...");
								// calls callback url
								callback = callback + "/" + recipeIDNum;
								request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
									
							}
						} else if(thresh == true) {
							// if thresh = true than if temp difference is > 3 than threshold = false
							var tempDiff = currentTemp - targetTemp;
							if (tempDiff > 3) {
								data.trigger.inThreshold = false;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (err) {

										});
									}
								});
							} 
						}
					} else if (relation == "tempGT") {
						// does GT relation
						if(currentTemp > targetTemp){
							if(thresh == false) {
								// changes threshold value to true
								data.trigger.inThreshold = true;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (err) {

										});
									}
								});
								// calls callback url
								console.log("Target hit, calling callback URL...");
								callback = callback + "/" + recipeIDNum;
								request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									//console.log(body);
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
							}
						} else if(thresh == true) {
							// if thresh = true than if temp difference is > 3 than threshold = false
							var tempDiff = targetTemp - currentTemp;
							if (tempDiff > 3) {
								data.trigger.inThreshold = false;
								recipesDB.insert(data, recipeIDNum, function(err, body, header){
									if(err){
										eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (err) {

										});
									}
								});
							} 
						}
					} 
				}
		
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Watches for weather alerts
function watchAlert(recipeIDNum){
	var eMsg;
	// Runs watch for weather advisories every 1 hour at the start of the hour
	//var cronJob = cron.job("0 0 */1 * * *", function() {
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var thresh = data.trigger.prevCond;

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/alerts/conditions/q/"
			requestURL += coord + ".json";

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});					
				} else {
					// Gets the current alert description from response
					var parsedbody = JSON.parse(body);
					var currentAlert = parsedbody.alerts.description;
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.alerts.date,
							"weather_advisory": currentAlert
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					if (currentAlert === undefined) {
						//Do nothing if there is no alert description (meaning no alert)
						if (thresh != "none") {
							// changes threshold value to undefined
							data.trigger.prevCond = "none";
							recipesDB.insert(data, recipeIDNum, function(err, body, header){
								if(err){
									eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
									fs.appendFile('errorLog.txt', eMsg, function (err) {

									});
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
									eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
									fs.appendFile('errorLog.txt', eMsg, function (err) {

									});
								}
							});
							// sets off trigger
							console.log("Target hit, calling callback URL...");
							callback = callback + "/" + recipeIDNum;
							request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
						}
					}
				}
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Watches for a specific weather condition
function watchCurWeather(recipeIDNum) {
	var eMsg;
	// Runs watch for weather every 1 hour at the start of the hour
	//var cronJob = cron.job("0 0 */1 * * *", function() {
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var weatherCond = data.trigger.weather;
			var thresh = data.trigger.inThreshold;

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if (err) {
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets the current alerts from response
					var parsedbody = JSON.parse(body);
					var curWeather = parsedbody.current_observation.weather;
					console.log("current weather: " + curWeather + "\n" + "Weather Condition: " + weatherCond);
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.current_observation.observation_time,
							"weather_current": curWeather
						}
					};
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
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
									eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
									fs.appendFile('errorLog.txt', eMsg, function (err) {

									});
								} else {
									//calls callback url
									console.log("Target hit, calling callback URL...");
									callback = callback + "/" + recipeIDNum;
									request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
										if(eRR) {
											eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
											fs.appendFile('errorLog.txt', eMsg, function (eRR) {

											});
										}
									});
								}
							});
							
						}
					} else if (thresh == true){
						// changes threshold value to false
						data.trigger.inThreshold = false;
						recipesDB.insert(data, recipeIDNum, function(err, body, header){
							if(err){
								eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
								fs.appendFile('errorLog.txt', eMsg, function (err) {

								});
							}
						});
					}
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Watches for a change in weather
function watchWeather(recipeIDNum) {
	var eMsg;
	// Runs watch for weather every 1 hour at the start of the hour
	//var cronJob = cron.job("0 0 */1 * * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var thresh = data.trigger.prevCond;

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets the current alerts from response
					var parsedbody = JSON.parse(body);
					var curWeather = parsedbody.current_observation.weather;
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.current_observation.observation_time,
							"weather_current": curWeather
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					
					// if the current weather is different from the past weather set off trigger
					if ( curWeather != thresh)  {
						//update threshold with current weather for next check
						data.trigger.prevCond = curWeather;
						recipesDB.insert(data, recipeIDNum, function(err, body, header){
							if(err){
								eMsg = "Failed to update database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
								fs.appendFile('errorLog.txt', eMsg, function (err) {

								});
							}
						});
						console.log("Target hit, calling callback URL...");
						callback = callback + "/" + recipeIDNum;
						request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
					} 
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays weather forecast
function todaysWeather(recipeIDNum) {
	var eMsg;
	// Runs every day at 4 am
	//var cronJob = cron.job("0 0 4 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var type = data.trigger.numSystem;
	
			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/conditions/q/"
			requestURL += coord + ".json";

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets todays weather forecast
					var parsedbody = JSON.parse(body);
					var curWeather;
					if (type == "US") {
						curWeather = parsedbody.forecast.txt_forecast.forecastday[0].fcttext;
					} else {
						curWeather = parsedbody.forecast.txt_forecast.forecastday[0].fcttext_metric;
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.forecast.simpleforecast.forecastday[0].pretty,
							"weather_current": curWeather
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					
					//Always sets off trigger
					console.log(curWeather);
					console.log("Target hit, calling callback URL...");
					callback = callback + "/" + recipeIDNum ;
					request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets tomorrows weather forecast
function tomWeather(recipeIDNum) {
	var eMsg;
	// Runs every day at noon
	//var cronJob = cron.job("0 0 12 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var type = data.trigger.numSystem;
	
			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){ 
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var tomWeather;
					if (type == "US") {
						tomWeather = parsedbody.forecast.txt_forecast.forecastday[2].fcttext;
					} else {
						tomWeather = parsedbody.forecast.txt_forecast.forecastday[2].fcttext_metric;
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.forecast.simpleforecast.forecastday[2].pretty,
							"weather_tomorrow": tomWeather
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					//Always sets off trigger
					console.log(tomWeather);
					console.log("Target hit, calling callback URL...");
					callback = callback + "/" + recipeIDNum ;
					request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
						if(eRR) {
							eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
							fs.appendFile('errorLog.txt', eMsg, function (eRR) {

							});
						}
					});
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets tomorrows high temperature
function tomHighTemp(recipeIDNum) {
	var eMsg;
	// Runs every day at noon
	//var cronJob = cron.job("0 0 12 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var temp = data.trigger.watchNum;
			var type = data.trigger.numSystem;
	
			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets tomorrows weather 
					var parsedbody = JSON.parse(body);
					var tomHigh;
					if (type == "US") {
						tomHigh = parsedbody.forecast.simpleforecast.forecastday[2].high.fahrenheit;
					} else {
						tomHigh = parsedbody.forecast.simpleforecast.forecastday[2].high.celsius;
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.forecast.simpleforecast.forecastday[2].pretty,
							"weather_temperature": tomHigh
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					console.log("Is tomorrows high temp of "+tomHigh+" greater than "+temp);
					// If tomorrows High > x than set off trigger
					if (temp < tomHigh) {
						console.log("Target hit, calling callback URL...");
						callback = callback + "/" + recipeIDNum;
						request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
					}
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets tomorrows low temperature
function tomLowTemp(recipeIDNum) {
	var eMsg;
	// Runs every day at noon
	//var cronJob = cron.job("0 0 12 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var temp = data.trigger.watchNum;
			var type = data.trigger.numSystem;
	
			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var tomLow;
					if (type == "US") {
						tomLow = parsedbody.forecast.simpleforecast.forecastday[2].low.fahrenheit;
					} else {
						tomLow = parsedbody.forecast.simpleforecast.forecastday[2].low.celsius;
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.forecast.simpleforecast.forecastday[2].pretty,
							"weather_temperature": tomLow
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					console.log("Is tomorrows low temp of "+tomLow+" less than "+temp);
					// If tomorrows Low < x than set off trigger
					if (temp > tomLow) {
						console.log("Target hit, calling callback URL...");
						callback = callback + "/" + recipeIDNum;
						request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
					}
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays max wind speed
function todayWind(recipeIDNum) {
	var eMsg;
	// Runs every day at 5 am
	//var cronJob = cron.job("0 0 5 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var windSpeed = data.trigger.watchNum;
			var type = data.trigger.numSystem;
	
			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var maxWind;
					if (type == "US") {
						maxWind = parsedbody.forecast.simpleforecast.forecastday[2].maxwind.mph;
					} else {
						maxWind = parsedbody.forecast.simpleforecast.forecastday[2].maxwind.kph;
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.forecast.simpleforecast.forecastday[2].pretty,
							"weather_wind": maxWind,
							"weather_wind_direction": parsedbody.forecast.simpleforecast.forecastday[2].maxwind.dir 
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					//direction is "".maxwind.dir if needed;
					console.log("Is tomorrows wind speed of "+maxWind+" greater than "+windSpeed);
					// If tomorrows Low < x than set off trigger
					if (maxWind > windSpeed) {
						console.log("Target hit, calling callback URL...");
						callback = callback + "/" + recipeIDNum ;
						request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
					}
				} 
			});
		}
	
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays max humidity
function todayHumid(recipeIDNum) {
	var eMsg;
	// Runs every day at 5 am
	//var cronJob = cron.job("0 0 5 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var humid = data.trigger.watchNum;
	
			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/forecast10day/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var maxHumid = parsedbody.forecast.simpleforecast.forecastday[2].maxhumidity;
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.forecast.simpleforecast.forecastday[2].pretty,
							"weather_humidity": maxHumid
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					// If tomorrows Low < x than set off trigger
					console.log("Is tomorrows humidity of "+maxHumid+" greater than "+humid);
					if (maxHumid > humid) {
						console.log("Target hit, calling callback URL...");
						callback = callback + "/" + recipeIDNum;
						request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
					}
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays max UV
function todayUV(recipeIDNum) {
	var eMsg;
	// Runs every day at 5 am
	//var cronJob = cron.job("0 0 5 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;
			var uv = data.trigger.watchNum;

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);

			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets tomorrows weather forecast
					var parsedbody = JSON.parse(body);
					var curUV = parsedbody.current_observation.UV;
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.current_observation.observation_time,
							"weather_UV": curUV
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					// If tomorrows Low < x than set off trigger
					console.log("Is tomorrows UV of "+curUV+" greater than "+uv);
					if (curUV > uv) {
						console.log("Target hit, calling callback URL...");
						callback = callback + "/" + recipeIDNum ;
						request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
					}
				} 
			});
		}
	});
	});
	cronJob.start();
}

// Takes recipe out of database with database key recipeIDnum and sends a get request to
// api and potentially sets off a trigger
// Gets todays sunrise or sunset time
function todaySun(recipeIDNum) {
	var eMsg;
	// Runs every day at 5 am
	//var cronJob = cron.job("0 0 5 */1 * *", function(){
	var cronJob = cron.job("0 */1 * * * *", function(){
	// gets recipe from database from the key recipeIDNum
	recipesDB.get(recipeIDNum, function(err, data) {
		if (err) {
			eMsg = "Failed to access the database for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
			fs.appendFile('errorLog.txt', eMsg, function (err) {

			});
		} else {
			// gets all of the variables from DB data
			var lon = data.trigger.lon;
			var lat = data.trigger.lat;
			var coord = lon.toString() + "," + lat.toString();
			var relation = data.trigger.relation;
			var callback = data.callbackURL;

			// Sets ups request from weather api
			requestURL = "http://api.wunderground.com/api/"
			requestURL += weatherAPIKey + "/astronomy/conditions/q/"
			requestURL += coord + ".json";
			// console.log(requestURL);
			
			// sends the request to the weather api and parses through the response 
			// for the wanted information and does the comparison
			request(requestURL, function(err, res, body){
				if(err){
					eMsg = "Failed to reach weather API for recipe _id=" + recipeIDNum + "\n" + err + "\n"+"\n" ;
					fs.appendFile('errorLog.txt', eMsg, function (err) {

					});
				} else {
					// Gets todays sunrise or sunset
					var parsedbody = JSON.parse(body);
					var todaySunHour;
					var todaySunMin;
					if ("todSunrise" == relation) {
						todaySunHour = parsedbody.moon_phase.sunrise.hour;
						todaySunMin = parsedbody.moon_phase.sunrise.minute;
						//console.log("Todays sunrise wil be at "+todaySunHour+":"+todaySunMin);
					} else {
						todaySunHour = parsedbody.moon_phase.sunset.hour;
						todaySunMin = parsedbody.moon_phase.sunset.minute;
						//console.log("Todays sunset wil be at "+todaySunHour+":"+todaySunMin);
					}
					//Ingredients
					var country = parsedbody.current_observation.observation_location.country;
					var state = parsedbody.current_observation.observation_location.full;
					var ingred = {
						"ingredients_data": {
							"weather_location": state + ", " +country,
							"weather_date": parsedbody.current_observation.observation_time,
							"weather_sun": todaySunHour+":"+todaySunMin
						}
					}
					//Headers for callbackURL
					var headers = {
						'Content-Type': 'application/json',
						'nsds-api-key': onitAPIKey
					};
					console.log("Target hit, calling callback URL...");
					callback = callback + "/" + recipeIDNum;
					request.post(callback, { 'headers': headers, 'body': JSON.stringify(ingred)}, function(eRR,httpResponse,body) {
									if(eRR) {
										eMsg = "Failed to reach callback URL for recipe _id=" + recipeIDNum + "\n" + eRR + "\n"+"\n" ;
										fs.appendFile('errorLog.txt', eMsg, function (eRR) {

										});
									}
								});
				} 
			});
		}
	});
	});
	cronJob.start();
}


app.listen(port);

