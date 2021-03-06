var citygridAPI = require('../models/citygridModel');
var citygridParser = require('../models/citygridJSONParserModel');
var googleGeocoder = require('../models/googleGeocoderModel');

var params = {
	'start': '',
	'end': ''
};

// need to reset because variables are persistent
function resetVariables() {
	response = null;
	request = null;
	filteredAddressesReq = null;
	params = {
		'start': '',
		'end': ''
	};
	waypointCounter = 0;
	waypointMax = null;
	stopsWaypointFormat = [];
	stops = [];
}

var response = null, 
	request = null, 
	filteredAddressesReq = null;
exports.filterStops = function(req, res) {
	resetVariables();
	response = res;
	request = req;

	var parsedReq = JSON.parse(request.body.params);
	params.start = parsedReq.start;
	params.end = parsedReq.end;

	// remove validated addresses from waypoints list
	filteredAddressesReq = parsedReq.waypts;
	removeAddresses(filteredAddressesReq);
}

var waypointCounter = 0, waypointMax;
function removeAddresses(filteredAddresses) {
	// figure out the max number of waypoints so we know when to allow processing of non-addresses
	waypointMax = filteredAddresses.length;

	var filteredCopy = filteredAddressesReq;
	// loop through waypoints to remove valid addresses from places API search, and bypass to google maps routing
	for(i = 0; i < waypointMax; i++) {
		validateAddress(filteredCopy[i], finishedValidation);
	}
}

function validateAddress(waypt, callback) {
	// check if google maps geocoding returns lat lng or error
	googleGeocoder.geocode(waypt, callback);
}

function finishedValidation(waypt, status) {
	/* if callback is good (i.e. address is valid), remove from filteredAddresses and add to final waypints */
	if(status == 'OK') {
		console.log('Waypt is an address: ' + waypt);
		filteredAddressesReq = removeFromList(waypt, filteredAddressesReq);
		pushSingleStopIntoWaypoints(waypt);
	} else {
		// console.log('status is NOT ok for: ' + waypt);
	}

	incrementWaypointCounter();
	GETStopsIfDoneFilteringAddresses();
}

function incrementWaypointCounter() {
	waypointCounter++;
}

// once validation finishes, begins looking up stops
function GETStopsIfDoneFilteringAddresses() {
	if(waypointCounter == waypointMax) {
		console.log('done!');
		var parsedReq = JSON.parse(request.body.params);
		parsedReq.waypts = filteredAddressesReq;

		var boxesParsed = JSON.parse(request.body.params).boxes;

		GETStopsFromCityGrid(filteredAddressesReq, boxesParsed, parsedReq, response);
	}
}

// splice wasn't working correctly, so this actually returns a new array omitting the item
function removeFromList(item, list) {
	var arr = [];
	console.log('need to remove: ' + item);
	var indexToRemove = -1;
	for(var i = 0; i < list.length; i++) {
		if(list[i] != item) {
			arr.push(list[i]);
		}
	}
	console.log('new list after removal: ' + arr);

	return arr;
}

// invokes citygrid API model to send GET requests using the box boundaries and stop search terms.
function GETStopsFromCityGrid(waypoints, boxes, req, res) {
	citygridAPI.lookupStops(waypoints, boxes, req, res, printData);
};

// stopLoc is the formatted, google maps-ready data structure
var stopsWaypointFormat = [],
	stops = [];
// callback used whenever a result is returned from a single API get request
function printData(requestResponse, progressCounters, parameters) {	
	// limit = criteria for qualifying json response, progress = % of requests done
	passToParser(requestResponse, getLimits(), progressCounters, callback);
}

function setLimits() {}

function getLimits() {
	// limits/requirements to qualify results, for future use
	var limits = {
		'max_distance': 5,
		'total_hits': 0,
	};

	return limits;
}

// pushes address into waypoint object array
function pushStopsIntoWaypoints(stopsArray) {
	for (var key in stopsArray) {
		stopsWaypointFormat.push({
			location: stopsArray[key],
			stopover: true
		});
		console.log('key/value: ' + key + ' / ' + stopsArray[key]);
	}
}

function pushSingleStopIntoWaypoints(stop) {
	stopsWaypointFormat.push({
		location: stop,
		stopover: true
	});
	console.log('address pushed: ' + stop);
}

// parser's callback
function callback(parsedlocation, progress) {
	// right now responseStatus just means that results' data exists, will update in future to include limits/requirements
	responseStatus = parsedlocation.status;
	if(responseStatus == 'OK') {
		addToStopsDict(parsedlocation);
	} else {
		// do nothing yet
	}
	if((progress.request_counter*100)/(progress.total_requests) == 100) {
		renderDirections();
	}
}


// after receives that single API result, sends to parser
function passToParser(requestResponse, limits, progress, callback) {
	citygridParser.parseJSON(requestResponse, limits, progress, callback);
}

function renderDirections() { 
	console.log('stopsWaypointFormat: ' + stopsWaypointFormat.length);
	pushStopsIntoWaypoints(stops);
	console.log('filtered addresses array: ' + filteredAddressesReq);
	// pushStopsIntoWaypoints(filteredAddressesReq);
	response.render('map', { title: 'RouteStop', start: params.start, end: params.end, stops: JSON.stringify(stopsWaypointFormat) });
}

function printDict(dict) {
	for (var key in dict) {
		console.log('stopsFormattedArray: ' + key + ' / ' + dict[key]);
	}
}

// makes sure only one of each stop type is stored in stops array
function addToStopsDict(location) {
	if(!(location.key in stops)) {
		// '*/' symbol is used to separate name from address
		stops[location.key] = location.name + '*/' + location.address.full_address;
	}
}

