var Promise = require('bluebird');
var _ = require('lodash');
var fetch = require('node-fetch');
var fs = require('fs');
var changeCase = require('change-case');

var options = {
    usernameLength: 3,
    verbose: false,
    token: ''
};

if (process.env.NAMECHK_TOKEN) options.token = process.env.NAMECHK_TOKEN;
var args = getArgs();
if (args.site) {
    options.site = args.site;
} else {
    console.log('Must specify site');
    process.exit();
}
if (args.verbose) options.verbose = args.verbose;

var usernames = getCombinations(options.usernameLength, 'abcdefghijklmnopqrstuvwxyz');
var groups = getUsernameGroups(usernames);
console.log('Username Combinations: ' + usernames.length);
_.each(options, function(option, key) {
    console.log(changeCase.titleCase(key) + ': ' + option);
});
console.log('');
getAvailableUsernames(groups, options.site);

function getArgs() {
    var args = {
        verbose: false,
        site: false
    };
    _.each(process.argv, function(arg) {
        if (arg.substr(arg.length - 4) !== 'node' && arg.substr(arg.length - 3) !== '.js') {
            if (arg === '--verbose' || arg === '-v') {
                args.verbose = true;
            } else {
                args.site = arg;
            }
        }
    });
    return args;
}

function getCombinations(count, alphabet, word) {
    var combinations = [];
    if (count > 0) {
        _.each(alphabet, function(char) {
            var fullWord = getCombinations(count - 1, alphabet, (word ? word : '') + char);
            if (fullWord) {
                combinations.push(fullWord);
            }
        });
        if (word) {
            if (combinations.length > 0) return combinations;
        } else {
            return _.flattenDeep(combinations);
        }
    } else {
        return word;
    }
}

function getUsernameGroups(usernames) {
    var groups = [];
    var group = [];
    var count = 0;
    _.each(usernames, function(username) {
        group.push(username);
        if (group.length > 5 || count >= usernames.length) {
            groups.push(group);
            group = [];
        }
    });
    return groups;
};

function getAvailableUsernames(groups, site) {
    return new Promise(function(resolve, reject) {
        fs.open(site + '.log', 'a', undefined, function(err, fd) {
            if(err) throw err;
            var count = 0;
            var promises = _.map(groups, function(group) {
                return fetch('https://api.namechk.com/services/bulk_check.json', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        AUTHORIZATION: 'Bearer ' + options.token,
                        Accept: 'application/vnd.api.v1+json'
                    },
                    body: JSON.stringify({
                        site: site,
                        usernames: group
                    })
                }).then(function(res) {
                    return res.json();
                }).then(function(body) {
                    var available = [];
                    var promises = _.map(body, function(result) {
                        return new Promise(function(resolve, reject) {
                            if (options.verbose) console.log(count++);
                            if (result.available) {
                                console.log(result.username);
                                available.push(result.username);
                                fs.write(fd, result.username + '\n', undefined, undefined, function(err) {
                                    if (err) reject(err);
                                    resolve(result.username);
                                });
                            } else {
                                resolve(false);
                            }
                        });
                    });
                    return Promise.all(promises).then(function(messages) {
                        if (available.length > 0) {
                            return available;
                        } else {
                            return false;
                        }
                    });
                });
            });
            Promise.all(promises).then(function(groups) {
                fs.close(fd, function(err) {
                    if (err) reject(err);
                    resolve(groups);
                });
            });
        });
    });
};
