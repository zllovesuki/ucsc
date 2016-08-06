var Promise = require('bluebird');
var util = require('util');
var fs = require('fs');

var read = function(name) {
    return new Promise(function(resolve ,reject) {
        fs.readFile(name, {
            encoding: 'utf-8'
        }, function(err, data) {
            if (err) {
                return reject(err);
            }
            return resolve(JSON.parse(data));
        })
    })
}

function write(name, json) {
    return new Promise(function(resolve, reject) {
        fs.writeFile(name, json, function(err) {
            if (err) {
                return reject(err);
            }
            return resolve();
        });
    })
}

var coursesSpring = {};
var coursesSummer = {};
var coursesFall = {};
var coursesWinter = {};

return read('./db/terms.json').then(function(json) {
    return Promise.map(json, function(term) {
        return read('./db/terms/' + term.code + '.json').then(function(courses) {
            return Promise.map(Object.keys(courses), function(subject) {
                return Promise.map(courses[subject], function(course) {
                    var code = subject + ' ' + course.c;
                    var year = '20' + term.code.substring(1, 3);
                    switch (term.code[term.code.length - 1]) {
                        case '0': // Winter

                        if (typeof coursesWinter[code] === 'undefined') coursesWinter[code] = {};
                        if (typeof coursesWinter[code][year] === 'undefined') coursesWinter[code][year] = 1;
                        else coursesWinter[code][year]++;

                        break;

                        case '2': // Spring

                        if (typeof coursesSpring[code] === 'undefined') coursesSpring[code] = {};
                        if (typeof coursesSpring[code][year] === 'undefined') coursesSpring[code][year] = 1;
                        else coursesSpring[code][year]++;

                        break;

                        case '4': // Summer

                        if (typeof coursesSummer[code] === 'undefined') coursesSummer[code] = {};
                        if (typeof coursesSummer[code][year] === 'undefined') coursesSummer[code][year] = 1;
                        else coursesSummer[code][year]++;

                        break;

                        case '8': // Fall

                        if (typeof coursesFall[code] === 'undefined') coursesFall[code] = {};
                        if (typeof coursesFall[code][year] === 'undefined') coursesFall[code][year] = 1;
                        else coursesFall[code][year]++;

                        break;
                    }
                })
            })
        })
    })
}).then(function() {
    var fields = ['year', 'course', 'offered'];
    var spring = [];
    var summer = [];
    var fall = [];
    var winter = [];
    var _spring = {};
    var _summer = {};
    var _fall = {};
    var _winter = {};
    var rSpring = {};
    var rSummer = {};
    var rFall = {};
    var rWinter = {};

    var years = ['2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016'].map(function(el) {
        return parseInt(el);
    })

    /*var training = function(courses) {
        //var _quarter;
        var _offered = {};
        return new Promise(function(resolve, reject) {
            for(var code in courses) {
                if (typeof[_offered][code] === 'undefined') _offered[code] = [];
                years.forEach(function(year) {
                    var offered = (courses[code] ? (courses[code][year + ''] > 0 ? 1 : 0) : 0);
                    _offered[code].push(offered);
                    _quarter.push({
                        year: year,
                        course: code,
                        offered: offered
                    })
                })
            }
            var doTrain = function(years, code, offered) {
                return new Promise(function(resolve, reject) {
                    var lr = new LinearRegression(years, offered, {
                        algorithm: 'GradientDescent'
                    });
                    lr.train(function(err) {
                        if (err) {
                            return reject(err);
                        }
                        var predict = lr.predict(2017);
                        console.log(code, predict);
                        return resolve(code, predict);
                    })
                })
            }

            var promises = [];
            for (var code in _offered) {
                promises.push(doTrain(years, code, _offered[code]))
            }
            return Promise.all(promises).then(function(results) {
                return resolve(results);
            }).catch(function(e) {
                return reject(e);
            })
        })
    }

    training(coursesSpring).then(function(results) {
        console.log(results)
    })*/

    var Table = require('cli-table');

    var list = [
        {
            spring: coursesSpring
        },
        {
            summer: coursesSummer
        },
        {
            fall: coursesFall
        },
        {
            winter: coursesWinter
        }
    ];

    list.forEach(function(obj) {
        for (var quarter in obj) {
            var table = new Table({
                head: ['Quarter', 'Course', 'Frequency', 'Years'],
                colWidths: [15, 15, 15, 100]
            });
            for (var code in obj[quarter]) {
                var year = Object.keys(obj[quarter][code]);
                table.push([quarter, code, year.length + '/' + years.length, year.join(', ')])
                //console.log(code, 'was offered', year.length, year.length > 1 ? 'times' : 'time' , 'in', quarter, 'in the past', years.length, 'years', '->', year.join(', '));
            }
            write('./db/offered/display/' + quarter, table.toString());
            write('./db/offered/' + quarter + '.json', JSON.stringify(obj[quarter]));
        }
    })

    /*var lr = {};
    for(var code in coursesSpring) {
        var _offered = [];
        years.forEach(function(year) {
            var offered = (coursesSpring[code] ? (coursesSpring[code][year] > 0 ? 1 : 0) : 0);
            _offered.push(offered);
            spring.push({
                year: year,
                course: code,
                offered: offered
            })
            if (typeof _spring[code] === 'undefined') _spring[code] = [];
            _spring[code].push([year - 2004, offered])
        })
        if (typeof rSpring[code] === 'undefined') rSpring[code] = {};
        rSpring[code] = regression('linear', _spring[code]);
        lr[code] = new LinearRegression(years, _offered, {
            algorithm: 'GradientDescent'
        });
        lr[code].train(function(err) {
            //console.log(lr[code].predict('2017'))
        })
    }*/
    /*
    var springCSV = json2csv({ data: spring, fields: fields });
    write('./csv/spring.csv', springCSV);
    write('./regression/spring.json', JSON.stringify(rSpring));
    for(var code in coursesSummer) {
        years.forEach(function(year) {
            var offered = (coursesSummer[code] ? (coursesSummer[code][year] > 0 ? 1 : 0) : 0);
            summer.push({
                year: year,
                course: code,
                offered: offered
            })
            if (typeof _summer[code] === 'undefined') _summer[code] = [];
            _summer[code].push([year - 2004, offered])
        })
        if (typeof rSummer[code] === 'undefined') rSummer[code] = {};
        rSummer[code] = regression('linear', _summer[code]);
    }
    var summerCSV = json2csv({ data: summer, fields: fields });
    write('./csv/summer.csv', summerCSV);
    write('./regression/summer.json', JSON.stringify(rSummer));
    for(var code in coursesFall) {
        years.forEach(function(year) {
            var offered = (coursesFall[code] ? (coursesFall[code][year] > 0 ? 1 : 0) : 0);
            fall.push({
                year: year,
                course: code,
                offered: offered
            })
            if (typeof _fall[code] === 'undefined') _fall[code] = [];
            console.log([year - 2004, offered])
            _fall[code].push([year - 2004, offered])
        })
        if (typeof rFall[code] === 'undefined') rFall[code] = {};
        rFall[code] = regression('linear', _fall[code]);
    }
    var fallCSV = json2csv({ data: fall, fields: fields });
    write('./csv/fall.csv', fallCSV);
    write('./regression/fall.json', JSON.stringify(rFall));
    for(var code in coursesWinter) {
        years.forEach(function(year) {
            var offered = (coursesWinter[code] ? (coursesWinter[code][year] > 0 ? 1 : 0) : 0);
            winter.push({
                year: year,
                course: code,
                offered: offered
            })
            if (typeof _winter[code] === 'undefined') _winter[code] = [];
            _winter[code].push([year - 2004, offered])
        })
        if (typeof rWinter[code] === 'undefined') rWinter[code] = {};
        rWinter[code] = regression('linear', _winter[code]);
    }
    var winterCSV = json2csv({ data: winter, fields: fields });
    write('./csv/winter.csv', winterCSV);
    write('./regression/winter.json', JSON.stringify(rWinter));*/
})
