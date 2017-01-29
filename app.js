var Promise = require('bluebird');
var _ = require('lodash');
var fetch = require('node-fetch');
var fs = require('fs');
var changeCase = require('change-case');
var commander = require('commander');

var defaults = {
	version: '0.0.2',
	chars: 'abcdefghijklmnopqrstuvwxyz',
	min: 3,
	max: 4,
	regex: '',
	results: 25000,
	site: 'twitter',
	verbose: false
}

function main() {
	commander.version(defaults.version)
		.description('Checks for available usernames')
		.option('-v --verbose', 'Verbose mode')
		.option('-c --chars [chars]', 'Characters used to generate combinations')
		.option('--max [max]', 'Maximum length')
		.option('--min [min]', 'Minimum length')
		.option('-r --regex [regex]', 'Regular expression used to filter combinations')
		.option('--results [results]', 'Number of results to check')
		.parse(process.argv);
	var options = getOptions(defaults, commander);
	var combinations = getCombinations(
		options.chars,
		options.min,
		options.max,
		new RegExp(options.regex),
		options.results);
	getAvailableUsername(combinations, options.site, options.verbose).then(function(usernames) {
		if (options.verbose) {
			console.log('');
			if (usernames.length > 0) console.log(usernames);
		}
		if (usernames.length <= 0) console.log('No available usernames found');
	}).catch(function(err) {
		if (options.verbose) console.error(err.message);
	});
}

function getOptions(defaults, commander) {
	var options = {
		chars: commander.chars ? commander.chars : defaults.chars,
		min: commander.min ? Number(commander.min) : defaults.min,
		max: commander.max ? Number(commander.max) : defaults.max,
		regex: commander.regex ? commander.regex : defaults.regex,
		results: commander.results ? Number(commander.results) : defaults.results,
		verbose: commander.verbose ? commander.verbose : defaults.verbose,
		site: commander.args[0] ? commander.args[0] : defaults.site
	};
	_.each(options, function(option, key) {
		console.log(changeCase.titleCase(key) + ': ' + option);
	});
	console.log('-----------------------\n');
	return options;
}

function getAvailableUsername(combinations, site, verbose) {
	prettySite = changeCase.titleCase(site);
	return new Promise(function(resolve, reject) {
		fs.open(site + '.log', 'a', undefined, function(err, fd) {
			if (err) reject(err);
			resolve(fd);
		});
	}).then(function(fd) {
		var promises = _.map(combinations, function(combination) {
			if (verbose) console.log('Trying ' + prettySite + ' Combination: ' + combination);
			return checkSite(combination, site).then(function(username) {
				return new Promise(function(resolve, reject) {
					if (username) {
						console.log('Available ' + prettySite + ' Username: ' + username);
						fs.write(fd, username + '\n', undefined, undefined, function(err) {
							if (err) reject(err);
							resolve(username);
						});
					} else {
						resolve(undefined);
					}
				});
			});
		});
		return Promise.all(promises).then(function(usernames) {
			usernames = _.filter(usernames, function(username) {
				return !!username;
			});
			return {
				usernames: usernames,
				fd: fd
			};
		});
	}).then(function(data) {
		var usernames = data.usernames;
		var fd = data.fd;
		return new Promise(function(resolve, reject) {
			fs.close(fd, function(err) {
				if (err) reject(err);
				resolve(usernames);
			});
		});
	}).then(function(usernames) {
		return usernames;
	});
}

function checkSite(combination, site) {
	return new Promise(function(resolve, reject) {
		switch(site) {
		case 'twitter':
			checkTwitter(combination).then(function(username) {
				resolve(username);
			}).catch(function(err) {
				reject(err);
			});
			break;
		case 'wordpress':
			checkWordPress(combination).then(function(username) {
				resolve(username);
			}).catch(function(err) {
				reject(err);
			});
			break;
		default:
			resolve(undefined);
			break;
		}
	});
}

// This is the brains of the operation (DO NOT TOUCH)
function getCombinations(chars, min, max, regex, results) {
	var combinations = [];
	for (var i = 0; i <= (max - min); i++) {
		getCombinationsOfLength(min + i, chars, regex);
	}
	function getCombinationsOfLength(count, chars, regex) {
		_getCombinations(count, chars);
		function _getCombinations(count, chars, word) {
			if (count > 0) {
				_.each(chars, function(char) {
					var fullWord = _getCombinations(count - 1, chars, (word ? word : '') + char);
					if (fullWord) {
						if (combinations && combinations.length >= results) return false;
						combinations.push(fullWord);
						return null;
					}
					return null;
				});
			} else {
				if (regex.test(word)) return word;
			}
			return false;
		}
	}
	return combinations;
}

function checkTwitter(combination) {
	return fetch('https://twitter.com/' + combination)
		.then(function(response) {
			if (response.status == 404) return combination;
			return undefined;
		});
}

function checkWordPress(combination) {
	return fetch('https://' + combination + '.wordpress.com', {
		redirect: 'manual'
	}).then(function(response) {
		if (response.status === 302) return combination;
		return undefined;
	});
}

main();
