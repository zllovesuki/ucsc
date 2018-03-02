var fs = require('fs');
var url = require('url');
var Promise = require('bluebird');
var cheerio = require('cheerio');
var unserialize = require('./lib/unserialize');
var serialize = require('./lib/serialize');
var stringSimilarity = require('string-similarity');
var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9+/=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/rn/g,"n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
var maps = {
    classrooms: 'http://maps.ucsc.edu/content/all-classrooms',
    //colleges: 'http://maps.ucsc.edu/content/all-colleges',
    departments: 'http://maps.ucsc.edu/content/academic-departments',
    dining: 'http://maps.ucsc.edu/content/all-dining',
    libraries: 'http://maps.ucsc.edu/content/all-libraries'
};
var request = require('request').defaults({
    forever: true,
    pool: {
        maxSockets: process.env.NUMSOCKETS ? process.env.NUMSOCKETS : 20
    },
    timeout: 180 * 1000
});
var faker = require('faker');
var j = require('request').jar();
var pkg = require('./package.json')

var contactInfo = (typeof process.env.CONTACT === 'undefined' ? 'User did not specify his/her contact information' : process.env.CONTACT)
var ua = 'UCSC Course Data Fetcher/' + pkg.version + ' ' + contactInfo;

if (process.env.SOCKS) {
    var sAgent = require('socks5-https-client/lib/Agent');
    var Agent = require('socks5-http-client/lib/Agent');
}

var common = {
    'binds[:reg_status]': 'all',
    'binds[:subject]': '',
    'binds[:catalog_nbr_op]': '=',
    'binds[:catalog_nbr]': '',
    'binds[:title]': '',
    'binds[:instr_name_op]': '=',
    'binds[:instructor]': '',
    'binds[:ge]': '',
    'binds[:crse_units_op]': '=',
    'binds[:crse_units_from]': '',
    'binds[:crse_units_to]': '',
    'binds[:crse_units_exact]': '',
    'binds[:days]': '',
    'binds[:times]': '',
    'binds[:acad_career]': ''
};

var calculateNextTermCode = function(currentLatestTermCode) {
    currentLatestTermCode = currentLatestTermCode.toString()
    var nextTermCode = 0;
    switch (currentLatestTermCode[currentLatestTermCode.length - 1]) {
        case '0': // Winter

        case '2': // Spring

        case '8': // Fall

        nextTermCode = parseInt(currentLatestTermCode) + 2;

        break;

        case '4': // Summer

        nextTermCode = parseInt(currentLatestTermCode) + 4;

        break;
    }
    return nextTermCode;
}

var pad = function(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
} // http://stackoverflow.com/questions/10073699/pad-a-number-with-leading-zeros-in-javascript

var calculateTermName = function(termCode) {
    termCode = termCode % 2000;
    termCode = pad(termCode, 3, 0);
    var quarter = '';
    var name = '';
    switch (termCode[termCode.length - 1]) {
        case '0': // Winter

        quarter = 'Winter';

        break;

        case '2': // Spring

        quarter = 'Spring';

        break;

        case '8': // Fall

        quarter = 'Fall';

        break;

        case '4': // Summer

        quarter = 'Summer';

        break;
    }
    var year = '20' + termCode.substring(0, 2);
    name = year + ' ' + quarter + ' Quarter';
    return name;
}

var summerCipher = function(string) { // to make it compatible with the web interface
    if (string.indexOf('Session 1') !== -1 && string.indexOf('5 Weeks') !== -1) {
        return '5S1'
    }
    if (string.indexOf('Session 2') !== -1 && string.indexOf('5 Weeks') !== -1) {
        return '5S2'
    }
    if (string.indexOf('8 Weeks') !== -1) {
        return 'S8W'
    }
    if (string.indexOf('10 Weeks') !== -1) {
        return 'S10'
    }
    if (string.indexOf('Masters') !== -1 && string.indexOf('First') !== -1) {
        return 'ED1'
    }
    if (string.indexOf('Masters') !== -1 && string.indexOf('Fifth') !== -1) {
        return 'ED2'
    }
    return null
}

// http://jsfiddle.net/cse_tushar/xEuUR/
var twelveTo24 = function(time) {
    var hours = Number(time.match(/^(\d+)/)[1]);
    var minutes = Number(time.match(/:(\d+)/)[1]);
    var AMPM = time.match(/:*(\D\D)$/)[1];
    if (AMPM == "PM" && hours < 12) hours = hours + 12;
    if (AMPM == "AM" && hours == 12) hours = hours - 12;
    var sHours = hours.toString();
    var sMinutes = minutes.toString();
    if (hours < 10) sHours = "0" + sHours;
    if (minutes < 10) sMinutes = "0" + sMinutes;
    return (sHours +':'+sMinutes);
}

var parseTime = function(classData) {
    if (!(/\d/.test(classData.START_TIME))) return null;
    var obj = {
        day: [],
        time: {
            start: '',
            end: ''
        }
    };
    var dayKeys = [
        {
            abbr: 'MON',
            full: 'Monday'
        },
        {
            abbr: 'TUES',
            full: 'Tuesday'
        },
        {
            abbr: 'WED',
            full: 'Wednesday'
        },
        {
            abbr: 'THURS',
            full: 'Thursday'
        },
        {
            abbr: 'FRI',
            full: 'Friday'
        },
        {
            abbr: 'SAT',
            full: 'Saturday'
        },
        {
            abbr: 'SUN',
            full: 'Sunday'
        }
    ];
    dayKeys.forEach(function(dayObject) {
        if (classData[dayObject.abbr] === 'Y') {
            obj.day.push(dayObject.full);
        }
    })

    obj.time.start = twelveTo24(classData.START_TIME);
    obj.time.end = twelveTo24(classData.END_TIME);

    return obj;
}

var getHiddenForm = function(body) {
    var $ = cheerio.load(body);
    var form = $('#win0divPSHIDDENFIELDS input');
    var obj = {};
    Object.keys(form).forEach(function(index) {
        if (form[index].attribs) obj[form[index].attribs.name] = form[index].attribs.value;
    })
    // Now we can actually make the request
    /*
        Including the following params will give you a JavaScript redirect

        obj.ICAJAX = 1;
        obj.ICNAVTYPEDROPDOWN = 1;
    */
    return obj;
}

var myucscRequest = function(ua, cookie, url, data, referer) {
    return new Promise(function(resolve, reject) {
        var obj = {
            method: 'GET',
            url: url,
            headers: {
                'User-Agent': ua
            }
        }
        if (referer) obj.headers['Referer'] = referer
        obj.jar = cookie;
        if (data) {
            obj.method = 'POST';
            obj.form = data;
        }
        request(obj, function(err, response, body) {
            if (err) {
                return reject(err);
            }
            return resolve({
                headers: response.headers,
                body: body
            });
        })
    });
}

var secureRequest = function(url, data, jar) {
    jar = (typeof jar === 'undefined' ? false : true);
    return new Promise(function(resolve, reject) {
        var obj = {
            method: 'GET',
            url: url,
            agentOptions: {
                ciphers: "HIGH:!aNULL:!kRSA:!MD5:!RC4:!PSK:!SRP:!DSS:!DSA"
            },
            headers: {
                'User-Agent': ua
            }
        }
        if (data) {
            obj.method = 'POST';
            obj.form = data;
            obj.headers = {
                'Referer': 'https://pisa.ucsc.edu/class_search/index.php'
            };
        }
        if (jar) {
            obj.jar = j;
        }
        if (process.env.SOCKS) {
            obj.agentClass = sAgent;
            obj.agentOptions.socksHost = process.env.SOCKS.split(':')[0];
            obj.agentOptions.socksPort = process.env.SOCKS.split(':')[1];
        }
        if (process.env.BIND) {
            obj.localAddress = process.env.BIND;
        }
        request(obj, function(err, response, body) {
            if (err) {
                return reject(err);
            }
            return resolve(body);
        })
    });
}

var plainRequest = function(url, data) {
    return new Promise(function(resolve, reject) {
        var obj = {
            method: 'GET',
            url: url,
            agentOptions: {
                ciphers: "HIGH:!aNULL:!kRSA:!MD5:!RC4:!PSK:!SRP:!DSS:!DSA"
            },
            headers: {
                'User-Agent': ua
            }
        }
        if (data) {
            obj.method = 'POST';
            obj.form = data;
            obj.headers = {
                'Referer': 'https://pisa.ucsc.edu/class_search/index.php'
            };
        }
        if (process.env.SOCKS) {
            obj.agentClass = Agent;
            obj.agentOptions.socksHost = process.env.SOCKS.split(':')[0];
            obj.agentOptions.socksPort = process.env.SOCKS.split(':')[1];
        }
        if (process.env.BIND) {
            obj.localAddress = process.env.BIND;
        }
        request(obj, function(err, response, body) {
            if (err) {
                return reject(err);
            }
            return resolve(body);
        })
    });
}

var anonRequest = function(url) {
    return new Promise(function(resolve, reject) {
        var obj = {
            method: 'GET',
            url: url,
            agentOptions: {
                ciphers: "HIGH:!aNULL:!kRSA:!MD5:!RC4:!PSK:!SRP:!DSS:!DSA"
            },
            headers: {
                'User-Agent': faker.internet.userAgent()
            }
        }
        if (process.env.SOCKS) {
            obj.agentClass = Agent;
            obj.agentOptions.socksHost = process.env.SOCKS.split(':')[0];
            obj.agentOptions.socksPort = process.env.SOCKS.split(':')[1];
        }
        if (process.env.BIND) {
            obj.localAddress = process.env.BIND;
        }
        request(obj, function(err, response, body) {
            if (err) {
                return reject(err);
            }
            return resolve(body);
        })
    });
}

var secureDirectoryRequest = function(data, jar) {
    jar = (typeof jar === 'undefined' ? false : true);
    return new Promise(function(resolve, reject) {
        var obj = {
            method: 'GET',
            url: 'https://campusdirectory.ucsc.edu/cd_advanced',
            agentOptions: {
                ciphers: "HIGH:!aNULL:!kRSA:!MD5:!RC4:!PSK:!SRP:!DSS:!DSA"
            },
            headers: {
                'User-Agent': ua
            }
        }
        if (data) {
            obj.method = 'POST';
            obj.form = data;
            obj.headers = {
                'Referer': 'https://campusdirectory.ucsc.edu/cd_advanced'
            };
        }
        if (jar) {
            obj.jar = j;
        }
        if (process.env.SOCKS) {
            obj.agentClass = Agent;
            obj.agentOptions.socksHost = process.env.SOCKS.split(':')[0];
            obj.agentOptions.socksPort = process.env.SOCKS.split(':')[1];
        }
        if (process.env.BIND) {
            obj.localAddress = process.env.BIND;
        }
        request(obj, function(err, response, body) {
            if (err) {
                return reject(err);
            }
            return resolve(body);
        })
    });
}

var getURLFromObject = function(termId, obj) {
    // From Object to class_date in index.php
    /*
    'https://pisa.ucsc.edu/class_search/index.php?action=detail&class_data=' + encodeURIComponent(Base64.encode(serialize({
        STRM: <termId>,
        CLASS_NBR: courses[i].number
    })))
    */
    return 'https://pisa.ucsc.edu/class_search/index.php?action=detail&class_data=' + encodeURIComponent(Base64.encode(serialize({
        STRM: termId,
        CLASS_NBR: obj.num
    })))
}

var getTerms = function() {
    return secureRequest('https://pisa.ucsc.edu/class_search/index.php')
    .then(function(body) {
        var $ = cheerio.load(body);
        var actualTerms = [];

        $('#term_dropdown').find('option').each(function(i, elem) {
            actualTerms.push({
                code: $(this).attr('value'),
                name: $(this).text()
            });
        })
        return actualTerms;
    })
}

var getSubjects = function() {
    return secureRequest('https://pisa.ucsc.edu/class_search/index.php')
    .then(function(body) {
        var $ = cheerio.load(body);
        var actualSubjects = [];

        $('#subject').find('option').each(function(i, elem) {
            actualSubjects.push({
                code: $(this).attr('value'),
                name: $(this).text()
            });
        })
        return actualSubjects;
    })
}

var getCoursesRawDom = function(termId, limit) {
    return secureRequest('https://pisa.ucsc.edu/class_search/index.php', Object.assign({
        'action': 'results',
        'binds[:term]': termId
    }, common), true)
    .then(function(body) {
        return secureRequest('https://pisa.ucsc.edu/class_search/index.php', Object.assign({
            'action': 'update_segment',
            'binds[:term]': termId,
            'rec_start': 0,
            'rec_dur': limit || 25
        }, common), true)
    })
}

var getCourseRawDom = function(termId, courseNumber) {
    return secureRequest('https://pisa.ucsc.edu/class_search/index.php', Object.assign({
        'action': 'detail',
        'binds[:term]': termId,
        'class_data[:STRM]': termId,
        'class_data[:CLASS_NBR]': courseNumber,
        'rec_start': 0,
        'rec_dur': 25
    }, common), true)
}

var getGEDescRawDom = function() {
    return plainRequest('http://registrar.ucsc.edu/navigator/section3/gened/beginning2010/gen-ed-codes/index.html')
}

var searchOnRateMyProfessorRawDom = function(firstName, lastName) {
    return anonRequest('http://www.ratemyprofessors.com/search.jsp?query=' + encodeURIComponent([firstName, lastName].join(' ')));
}

var fetchRateMyProfessorRawDom = function(tid) {
    return anonRequest('http://www.ratemyprofessors.com/ShowRatings.jsp?tid=' + tid)
}

var fetchRateMyProfessorJSONAll = function(tid) {
    var array = [];
    var fetch = function(tid, page) {
        page = page || 1;
        return anonRequest('http://www.ratemyprofessors.com/paginate/professors/ratings?tid=' + tid + '&page=' + page)
        .then(function(body) {
            body = JSON.parse(body);
            array.push(body.ratings);
            return body.remaining;
        })
    }
    return fetch(tid).then(function(remaining) {
        var remainingPages = Math.ceil(remaining / 20);
        var arrayOfPromises = [];
        for (var i = 2; i <= remainingPages + 1; i++) {
            arrayOfPromises.push(fetch(tid, i))
        }
        return Promise.all(arrayOfPromises).then(function() {
            array = [].concat.apply([], array)
            return array;
        })
    })
}

var fetchMapsRawDom = function(key) {
    return secureRequest(maps[key]);
}

var getInfoFromSelector = function(body) {
    var $ = cheerio.load(body);

    var listingDom = $('ul.listings').find($('li.listing'));

    if (listingDom.length === 0) return null;

    var listings = [];
    var obj = {};

    listingDom.each(function(i, elm) {
        if ($(this).find($('.listing-cat')).text().trim() !== 'PROFESSOR') return;
        obj = {
            name: $(this).find($('.listing-name')).find($('.main')).text().trim(),
            school: $(this).find($('.listing-name')).find($('.sub')).text().trim(),
            tid: $(this).find('a').attr('href').slice($(this).find('a').attr('href').lastIndexOf('=') + 1)
        }
        if (obj.school.toLowerCase().indexOf('santa cruz') !== -1) {
            listings.unshift(obj);
        }else{
            listings.push(obj);
        }
    })

    return listings;
}

var parseRateMyProfessorFromSelector = function(body) {
    var $ = cheerio.load(body);

    var rating = {};

    rating.overall = $('.breakdown-container').find($('.grade')).text().trim()

    $('.breakdown-section').find($('.grade')).each(function(i, elm) {
        if (i === 0) rating.again = $(this).text().trim();
        else if (i === 1) rating.difficulty = $(this).text().trim();
        else return;
    })

    rating.tags = [];
    var split = []

    $('.tag-box').find($('.tag-box-choosetags')).each(function(i, elm) {
        split = $(this).text().split('(')
        rating.tags.push({
            tag: split[0].trim(),
            count: split[1].match(/\d+/g)[0]
        })
    })

    var count = $('.rating-count').text().trim().match(/\d+/g);

    rating.count = count ? count[0] : 'N/A';

    return rating;
}

var getObjByFullName = function(firstName, lastName) {
    return searchOnRateMyProfessorRawDom(firstName, lastName).then(function(body) {
        var obj = getInfoFromSelector(body);
        if (obj === null) {
            return null
        }else{
            return obj;
        }
    })
}

var getObjByLastName = function(lastName) {
    return searchOnRateMyProfessorRawDom('', lastName).then(function(body) {
        var obj = getInfoFromSelector(body);
        if (obj === null) {
            return null
        }else{
            return obj;
        }
    })
}

var getRateMyProfessorScoresByTid = function(tid) {
    return fetchRateMyProfessorRawDom(tid).then(function(body) {
        return {
            tid: tid,
            scores: parseRateMyProfessorFromSelector(body)
        }
    })
}

var getRateMyProfessorRatingsByTid = function(tid) {
    return fetchRateMyProfessorJSONAll(tid).then(function(ratings) {
        return {
            tid: tid,
            ratings: ratings
        }
    })
}

var parseGEDescDOMFromSelector = function(body) {
    var $ = cheerio.load(body);
    var geDesc = {};

    var domRef;
    var split = [];
    $('.contentBox').find('tr').each(function(i, elm) {
        if (i === 0) return;
        domRef = $(this).children().first();
        if (domRef.next().text().trim().length === 0) return;
        split = domRef.next().text().trim().split('and');
        split.forEach(function(text) {
            geDesc[text.trim()] = domRef.text().trim();
        })
    })
    // http://registrar.ucsc.edu/navigator/section3/gened/beginning2010/gen-ed-codes/{code}-code.html
    return geDesc;
}

var parseSeatsFromSelector = function(body) {
    var $ = cheerio.load(body);

    var seats = {};

    var split = [];
    var sections = [], section = {}, enrollment = '', wait = '';
    $('.panel-group').find($('.panel')).each(function(i, elm) {
        if ($(this).find('.panel-heading').text().trim() === 'Class Details') {
            $(this).find('.row').children().last().children().first().children().each(function(i, elm) {
                if (i === 1) seats.status = $(this).text().trim();
                if (i === 3) seats.avail = $(this).text().trim();
                if (i === 5) seats.cap = $(this).text().trim();
                if (i === 7) seats.enrolled = $(this).text().trim();
                if (i === 9) seats.waitCap = $(this).text().trim();
                if (i === 11) seats.waitTotal = $(this).text().trim();
            })
        }else if ($(this).find('.panel-heading').text().trim().indexOf('Discussion') !== -1) {
            $(this).find('.row').each(function(i, elm) {
                split = $(this).children().eq(0).text().trim().split(' ')
                section.num = split[0].match(/\d+/g)[0];
                section.sec = split[2];

                enrollment = $(this).children().eq(4).text().trim().replace(/\s/g, '')
                section.enrolled = parseInt(enrollment.substring(enrollment.indexOf(':') + 1, enrollment.indexOf('/')))
                section.cap = parseInt(enrollment.substring(enrollment.indexOf('/') + 1))
                wait = $(this).children().eq(5).text().trim()
                section.wait = parseInt(wait.substring(wait.indexOf(':') + 1, wait.indexOf('/')));
                section.waitTotal = parseInt(wait.substring(wait.indexOf('/') + 1));

                section.status = $(this).children().eq(6).text().trim();
                sections.push(section);
                section = {};
            })
            seats.sec = sections;
        }
    })
    return seats
}

var parseCourseDOMFromSelector = function(body) {
    var $ = cheerio.load(body);
    var bodyDom = $('.panel-group > .row > .panel-body');
    var course = {};
    // bodyDom[0] is the course information
    var infoDom = $('.col-xs-12', bodyDom[0])
    // infoDom[0] is the first column; infoDom[1] is the second column
    var dd = $('dd', infoDom[0]);
    // dd[4] is # of credits; dd[5] is GE
    if (!dd || !dd[3] || !dd[3].children) return false;
    course.ty = (dd[3].children[0] ? dd[3].children[0].data : null)
    course.cr = (dd[4].children[0] ? dd[4].children[0].data.match(/\d+/g)[0] : null)
    course.ge = (dd[5].children[0] ? dd[5].children[0].data.replace(/\s/g, '').split(',') : null)
    if (course.ge[0] === '') course.ge = [];

    // Currently we are only interested in static data
    /*
    var enrollDD = $('dd', infoDom[1]);
    // enrollDD[0] is the status; enrollDD[1] is available seats;
    // enrollDD[2] is capacity; enrollDD[3] is enrolled;
    // enrollDD[4] is waitlist capacity; enrollDD[5] is waitlist total
    console.log(enrollDD[0].children[1].data);
    console.log(enrollDD[1].children[0].data);
    console.log(enrollDD[2].children[0].data);
    console.log(enrollDD[3].children[0].data);
    console.log(enrollDD[4].children[0].data);
    console.log(enrollDD[5].children[0].data);
    */
    course.desc = null;
    course.re = null;
    course.com = [];
    course.sec = [];
    course.md = {
        start: null,
        end: null
    };
    var desc = null;
    var combinedDom = null;
    var reqText = null;
    var sectionDom = null;
    var meetingInfoDom = null;
    var searchString = null;
    var numPossibleSectionDom = bodyDom.length;
    for (var i = 0; i < numPossibleSectionDom; i++) {
        if (typeof bodyDom[i] !== 'undefined' ) {
            // TODO: this is disgusting
            searchString = bodyDom[i].parent.children[1].children[0].children[0].data.toLowerCase();
            if (searchString.indexOf('combined') !== -1) {
                combinedDom = $('tr', bodyDom[i]);
            }
            if (searchString.indexOf('requirements') !== -1) {
                reqText = bodyDom[i].children[0].data.trim()
                if (reqText.indexOf(': ') !== -1) {
                    reqText = reqText.substring(reqText.indexOf(': ') + 2);
                }
            }
            if (searchString.indexOf('discussion') !== -1) {
                sectionDom = $('.row', bodyDom[i]);
            }
            if (searchString.indexOf('meeting') !== -1) {
                meetingInfoDom = $('tr', bodyDom[i]);
            }

            if (searchString.indexOf('description') !== -1) {
                desc = bodyDom[i].children[0].data.trim();;
            }

            searchString = null;
        }
    }

    if (desc !== null) {
        course.desc = desc;
    }

    if (combinedDom !== null) {
        var numCombind = combinedDom.length;
        // i = 0 is the header, not interested
        for (var i = 1; i < numCombind; i++) {
            course.com.push(combinedDom[i].children[1].children[4].children[0].data);
        }
    }
    if (reqText !== null) {
        course.re = reqText;
    }
    if (sectionDom !== null) {
        var sections = [];
        var section = {};
        var obj = {};
        var split = [];
        var classDataCompatibleTime = {};
        var numSections = sectionDom.length;
        for (var i = 0; i < numSections; i++) {
            /*console.log(
                // Section class number
                sectionDom[i].children[1].children[0].data,
                // Meeting time
                sectionDom[i].children[3].children[0].data,
                // TA
                sectionDom[i].children[5].children[0].data,
                // location
                sectionDom[i].children[7].children[0].data,
                // enrollment status
                sectionDom[i].children[9].children[0].data,
                // wait list
                sectionDom[i].children[11].children[0].data,
                // open?
                sectionDom[i].children[13].children[1].data
            )*/
            if (sectionDom[i].children[3].children[0].data.replace(/^\s+/, "").indexOf('Cancel') !== -1) {
                // Let's account for cancelled class
                classDataCompatibleTime = false;
            }else if (sectionDom[i].children[3].children[0].data.replace(/^\s+/, "").substring(0, 3) === 'TBA') {
                classDataCompatibleTime = null;
            }else{
                split = sectionDom[i].children[3].children[0].data.replace(/^\s+/, "").split(' ');
                if (split[0].indexOf('M') !== -1) obj['MON'] = 'Y'
                if (split[0].indexOf('Tu') !== -1) obj['TUES'] = 'Y'
                if (split[0].indexOf('W') !== -1) obj['WED'] = 'Y'
                if (split[0].indexOf('Th') !== -1) obj['THURS'] = 'Y'
                if (split[0].indexOf('F') !== -1) obj['FRI'] = 'Y'
                if (split[0].indexOf('Sa') !== -1) obj['SAT'] = 'Y'
                if (split[0].indexOf('Su') !== -1) obj['SUN'] = 'Y'
                split = split[1].split('-');
                obj.START_TIME = split[0];
                obj.END_TIME = split[1];
                classDataCompatibleTime = parseTime(obj);
                split = [];
            }
            split = sectionDom[i].children[1].children[0].data.split(' ');
            section.num = split[0].match(/\d+/g)[0];
            section.sec = split[2];
            section.loct = [
                {
                    t: classDataCompatibleTime,
                    loc: sectionDom[i].children[7].children[0].data.replace('Loc: ', '')
                }
            ]

            section.ins = sectionDom[i].children[5].children[0].data.trim();
            section.cap = sectionDom[i].children[9].children[0].data.substring(sectionDom[i].children[9].children[0].data.lastIndexOf('/') + 1).trim();
            sections.push(section);
            section = {};
            obj = {};
            split = [];
        }
        course.sec = sections;
    }
    if (meetingInfoDom !== null) {
        var meetingDates = meetingInfoDom[1].children[7].children[0].data.replace(/^\s+/, "").split('-');
        course.md.start = meetingDates[0] ? meetingDates[0].trim() : '';
        course.md.end = meetingDates[1] ? meetingDates[1].trim() : '';
    }
    return course;
}

var parseDOMFromSelector = function(termId, body) {
    var courses = [], isSummer = false
    var obj = {}, timeObj = {}
    var $ = cheerio.load(body);
    var headers = $('a', $('h2', $('.panel-default')))
    var body = $('.panel-default > .panel-body > .row')
    var numHeaders = headers.length
    var numBody = body.length

    if (numHeaders !== numBody) {
        throw new Error('Mismatch header and body length.')
    }

    if (calculateTermName(termId).indexOf('Summer') !== -1) {
        isSummer = true
        console.log(termId + ': Summer quarter requires special treatment')
    }

    var parseLocation = [];
    var type = '';
    var location = '';
    var status = '';
    var classDataCompatibleTime = {};
    var split = [], timeIndex

    for (var i = 0; i < numHeaders; i++) {

        obj.c = headers[i].children[0].data;
        if (typeof body[i].children[1].children[1].children[0] !== 'undefined') {
            obj.num = parseInt(body[i].children[1].children[1].children[0].data);
        }else{
            obj.num = null;
        }

        // Real time enrollment status is not needed yet
        /*
        if (typeof body[i].children[9].children[0].data !== 'undefined') {
            Object.assign(courses[i], {
                status: body[i].children[9].children[0].data.replace(/^\s+/,"")
            });
        }
        */

        parseLocation = body[i].children[5].children[2].data.replace(/^\s+/, "").split(':', 2);

        if (typeof body[i].children[7].children[2] !== 'undefined' && body[i].children[7].children[2].data.indexOf('Summer') !== -1) {
            obj.l = summerCipher(body[i].children[7].children[2].data)
            timeIndex = 9
        }else{
            obj.l = null
            timeIndex = 7
        }
        
        if (body[i].children[timeIndex].children[2].data.replace(/^\s+/, "").indexOf('Cancel') !== -1) {
            // Let's account for cancelled class
            classDataCompatibleTime = false;
        }else if (body[i].children[timeIndex].children[2].data.replace(/^\s+/, "").substring(0, 3) === 'TBA') {
            classDataCompatibleTime = null;
        }else{
            split = body[i].children[timeIndex].children[2].data.replace(/^\s+/, "").split(' ');
            if (split[0].indexOf('M') !== -1) timeObj['MON'] = 'Y'
            if (split[0].indexOf('Tu') !== -1) timeObj['TUES'] = 'Y'
            if (split[0].indexOf('W') !== -1) timeObj['WED'] = 'Y'
            if (split[0].indexOf('Th') !== -1) timeObj['THURS'] = 'Y'
            if (split[0].indexOf('F') !== -1) timeObj['FRI'] = 'Y'
            if (split[0].indexOf('Sa') !== -1) timeObj['SAT'] = 'Y'
            if (split[0].indexOf('Su') !== -1) timeObj['SUN'] = 'Y'
            split = split[1].split('-');
            timeObj.START_TIME = split[0];
            timeObj.END_TIME = split[1];
            classDataCompatibleTime = parseTime(timeObj);
            split = [];
        }

        timeObj = {}

        Object.assign(obj, {
            // RateMyProfessors: https://www.google.com/search?btnG=1&pws=0&q=site:ratemyprofessors.com%20Santa%20Cruz%20 + name
            ins: {
                d: [ body[i].children[3].children[2].data.replace(/^\s+/, "") ]
            },
            //type: parseLocation[0],
            loct: [
                {
                    loc: parseLocation[1].replace(/^\s+/, "") === 'TBA' ? null : parseLocation[1].replace(/^\s+/, ""),
                    t: classDataCompatibleTime
                }
            ],
            cap: null
        });

        classDataCompatibleTime = {};

        courses.push(obj)
        obj = {}

    }

    /*
    var materials = $('.panel-default > .panel-body > .row > .hide-print')

    var numMaterials = Object.keys(materials).length - 4;

    for (var i = 0; i < numMaterials; i++) {

        // http://slugstore.ucsc.edu/ePOS?form=schedule.html&term=FL16&department.0=WRIT&course.0=169&section.0=01
        // Why store redundant data?
        Object.assign(courses[i], {
            materials: url.parse(materials[i].children[0].attribs.href).query
        });
    }*/

    var actualCourses = {};
    var parseCourseDash = [];
    var parseCourseBeforeDash = []
    var parseCourseAfterDash = []

    for (var i = 0, numCourses = courses.length; i < numCourses; i++) {
        parseCourseDash = courses[i].c.split(/-(.+)/)
        parseCourseBeforeDash = parseCourseDash[0].trim().split(/ (.+)/)
        parseCourseAfterDash = parseCourseDash[1].trim().split(/(\s+)(.+)/)
        if (typeof actualCourses[parseCourseBeforeDash[0]] === 'undefined') actualCourses[parseCourseBeforeDash[0]] = [];
        courses[i].c = parseCourseBeforeDash[1]
        courses[i].s = parseCourseAfterDash[0]
        courses[i].n = parseCourseAfterDash[2]
        actualCourses[parseCourseBeforeDash[0]].push(courses[i]);
    }

    var courses = actualCourses;

    var dup = {};
    var toMerge = [];
    var split = [];
    var master = {};
    var course = {};

    for (var subject in courses) {
        for (var i = 0, length = courses[subject].length; i < length; i++) {
            course = courses[subject][i];
            if (course.num) {
                if (typeof dup[subject + course.c + course.s] === 'undefined') {
                    dup[subject + course.c + course.s] = true;
                }else{
                    toMerge.push(subject + ':' + course.num);
                }
            }
        }
    }

    // toMerge contains the list of class numbers that have more than one time block (eg. MWF AND TuTh)
    // We are going to find an object with that, copy it to another array, delete the one in the original array
    // then traversing the WHOLE array (because my data structure is stupid), find the colliding one, copy that to another array
    // THEN delete that copy as well. After all that, we will merge the loct (location and time)
    // That means we have to change the data structure

    for (var i = 0, length = toMerge.length; i < length; i++) {
        split = toMerge[i].split(':');
        // 0 is the subject
        // 1 is the course number
        for (var j = 0, length2 = courses[split[0]].length; j < length2; j++) {
            if (courses[split[0]][j].num == split[1]) {
                if (typeof master[split[0]] === 'undefined') {
                    master[split[0]] = {};
                }
                if (typeof master[split[0]][split[1]] === 'undefined') {
                    master[split[0]][split[1]] = JSON.parse(JSON.stringify(courses[split[0]][j]));
                }else{
                    master[split[0]][split[1]].loct.push(JSON.parse(JSON.stringify(courses[split[0]][j].loct[0])));
                }

            }
        }

        var recursionRemove = function() {
            var index;
            for (var k = 0, length3 = courses[split[0]].length; k < length3; k++) {
                if (courses[split[0]][k].num == split[1]) {
                    if (-1 !== (index = courses[split[0]].indexOf(courses[split[0]][k])))
                    courses[split[0]].splice(index, 1);
                    return recursionRemove();
                }
            }
        }

        recursionRemove();

        split = [];
    }

    Object.keys(master).forEach(function(subject) {
        Object.keys(master[subject]).forEach(function(num) {
            master[subject][num].dup = true;
            courses[subject].push(master[subject][num]);
        })
    })

    return courses;
}

var parseMapsFromSelector = function(body) {
    var $ = cheerio.load(body);
    var scripts = $('script');
    var parsed;
    var locations = []
    for (var i = 0, length = scripts.length; i < length; i++) {
        if (scripts[i].children.length > 0) {
            if (scripts[i].children[0].data.indexOf('features') !== -1) {
                var script = scripts[i].children[0].data;
                script = script.substring(31).slice(0, -2);
                script = JSON.parse(script);
                locations = script.leaflet[0].features;
            }
        }
    }
    if (locations.length > 0) {
        for (var i = 0, length = locations.length; i < length; i++) {
            delete locations[i].type;
            delete locations[i].popup;
        }
    }
    return locations;
}

var downloadMajorMinor = function() {
    return new Promise(function(resolve, reject) {
        request
        .get('http://advising.ucsc.edu/planning/your-major/declaration/docs/major-declaration.pdf')
        .on('end', function() {
            return resolve();
        })
        .on('error', function(err) {
            return reject(err);
        })
        .pipe(fs.createWriteStream('/tmp/major-minor.pdf'))
    });
}

var pdf2HTML = function(filename) {
    return new Promise(function(resolve, reject) {
        var spawn = require('child_process').spawn;
        var pdftohtml = spawn('pdftohtml', ['-stdout', filename]);
        var html = '';
        var error = '';
        var errorOcc = false;
        pdftohtml.stdout.on('data', function(data) {
            html += data.toString('utf-8');
        })

        pdftohtml.stderr.on('data', function(data) {
            errorOcc = true;
            error += data.toString('utf-8')
        })

        pdftohtml.on('exit', function() {
            if (errorOcc) reject(error);
            else resolve(html);
        })
    });
}

var parseMajorMinor = function(html) {
    var $ = cheerio.load(html);
    var lines = $('br');
    var major = false;
    var minor = false;
    var line = '';
    var majors = [];
    var majorCounter = 0;
    var minors = [];
    var minorCounter = 0;
    var whatB = function(string) {
        var obj = [];
        if (string.replace(/\s+/g, "").indexOf('B.A.') !== -1) obj.push('BA')
        if (string.replace(/\s+/g, "").indexOf('B.S.') !== -1) obj.push('BS')
        if (string.replace(/\s+/g, "").indexOf('B.M.') !== -1) obj.push('BM')
        return obj;
    }
    for (var i = 0, length = lines.length; i < length; i++) {
        line = lines[i].prev.data;
        if (lines[i].prev.children && lines[i].prev.children[0].data.indexOf('Undergraduate Majors') !== -1) {
            major = true;
            minor = false;
        }else if (lines[i].prev.children && lines[i].prev.children[0].data.indexOf('Undergraduate Minors') !== -1) {
            major = false;
            minor = true;
        }else if (line && line.indexOf('check those that apply') !== -1) {
            major = false;
            minor = false;
        }
        if (!line || (major === false && minor === false)) continue;
        if (major) {
            if (line.slice(1, 2), line.slice(1, 2) == '☐') {
                // checkbox
                majors[majorCounter] = line;
            }else{
                // probably broke off from new line
                majors[majorCounter - 3] += line;
            }
            majorCounter++;
        }else if (minor) {
            if (line.slice(1, 2), line.slice(1, 2) == '☐') {
                minors[minorCounter] = line;
            }else{
                minors[minorCounter - 4] += line;
            }
            minorCounter++;
        }
    }
    majors = majors.filter(Boolean).map(function(el) {
        return el.split(' ').map(function(seg) { return seg.replace(/\s+/g, " ")}).join(' ').slice(2)
    }).map(function(el) {
        var obj = {};
        if (el.replace(/\s+/g, "").indexOf('☐') !== -1) {
            obj[el.slice(0, el.indexOf('☐') - 1)] = whatB(el);
        }else if (el.replace(/\s+/g, "").indexOf('B.A') !== -1) {
            obj[el.slice(0, el.indexOf('B.A') - 1)] = whatB(el);
        }else if (el.replace(/\s+/g, "").indexOf('B.S') !== -1) {
            obj[el.slice(0, el.indexOf('B.S') - 1)] = whatB(el);
        }
        return obj;
    })
    minors = minors.filter(Boolean).map(function(el) {
        return el.split(' ').map(function(seg) { return seg.replace(/\s+/g, " ")}).join(' ').slice(2)
    })
    return {
        majors: majors,
        minors: minors
    }
}

var getMajorMinor = function() {
    return downloadMajorMinor().then(function() {
        return pdf2HTML('/tmp/major-minor.pdf').then(function(html) {
            return parseMajorMinor(html);
        })
    })
}

var getMaps = function() {
    var locations = {};
    return Promise.map(Object.keys(maps), function(key) {
        return fetchMapsRawDom(key).then(function(body) {
            locations[key] = parseMapsFromSelector(body)
        })
    })
    .then(function() {
        return locations;
    })
}

var getCourses = function(termId, limit) {
    return getCoursesRawDom(termId, limit).then(function(body) {
        return parseDOMFromSelector(termId, body);
    })
}

var getCourse = function(termId, classNumber) {
    return getCourseRawDom(termId, classNumber).then(function(body) {
        var course = parseCourseDOMFromSelector(body);
        return course;
    })
}

var getSeats = function(termId, classNumber) {
    return getCourseRawDom(termId, classNumber).then(function(body) {
        var seats = parseSeatsFromSelector(body);
        return seats;
    })
}

var getGEDesc = function() {
    return getGEDescRawDom().then(function(body) {
        return parseGEDescDOMFromSelector(body);
    })
}

var testReq = function(testURL) {
    return secureRequest(testURL)
}

var getTranscriptHTML = function(username, password) {
    var cookie = request.jar();
    var ua = faker.internet.userAgent();
    return myucscRequest(ua, cookie, 'https://my.ucsc.edu/psp/ep9prd/?cmd=login&languageCd=ENG&').then(function(myucscLogin) {
        return myucscRequest(ua, cookie, 'https://my.ucsc.edu/psp/ep9prd/?cmd=login&languageCd=ENG', {
            timezoneOffset: 420,
            ptmode: 'f',
            ptlangcd: 'ENG',
            ptinstalledlang: 'ENG',
            userid: username,
            pwd: password
        }, 'https://my.ucsc.edu/psp/ep9prd/?cmd=login&languageCd=ENG&').then(function(postLogin) {
            if (postLogin.headers.location != 'https://my.ucsc.edu/psc/ep9prd/EMPLOYEE/EMPL/s/WEBLIB_PTBR.ISCRIPT1.FieldFormula.IScript_StartPage?HPTYPE=C') {
                console.error('Incorrect Credentials')
                return false;
            }
            return myucscRequest(ua, cookie, 'https://my.ucsc.edu/psp/ep9prd/EMPLOYEE/EMPL/h/?tab=DEFAULT')
            .then(function(mainPage) {
                return Promise.all([
                    // tracking
                    myucscRequest(ua, cookie, 'https://my.ucsc.edu/psc/ep9prd/EMPLOYEE/EMPL/s/WEBLIB_EO_PE_SR.ISCRIPT1.FieldFormula.Iscript_Track?&crefname=SCEP_STUDENT_CENTER&crefurl=https%3A%2F%2Fmy.ucsc.edu%2Fpsp%2Fep9prd%2FEMPLOYEE%2FPSFT_CSPRD%2Fc%2FSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL%3FFolderPath%3DPORTAL_ROOT_OBJECT.SCEP_MY_STUDENT_CENTER.SCEP_STUDENT_CENTER%26IsFolder%3Dfalse%26IgnoreParamTempl%3DFolderPath%252cIsFolder', null, 'https://my.ucsc.edu/psp/ep9prd/EMPLOYEE/EMPL/h/?tab=DEFAULT'),
                    // actual student center page
                    myucscRequest(ua, cookie, 'https://my.ucsc.edu/psp/ep9prd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL?FolderPath=PORTAL_ROOT_OBJECT.SCEP_MY_STUDENT_CENTER.SCEP_STUDENT_CENTER&IsFolder=false&IgnoreParamTempl=FolderPath%2cIsFolder', null, 'https://my.ucsc.edu/psp/ep9prd/EMPLOYEE/EMPL/h/?tab=DEFAULT')
                ]).spread(function(tracking, skeleton) {
                    return myucscRequest(ua, cookie, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL?FolderPath=PORTAL_ROOT_OBJECT.SCEP_MY_STUDENT_CENTER.SCEP_STUDENT_CENTER&IsFolder=false&IgnoreParamTempl=FolderPath%2cIsFolder&PortalActualURL=https%3a%2f%2fais-cs.ucsc.edu%2fpsc%2fcsprd%2fEMPLOYEE%2fPSFT_CSPRD%2fc%2fSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL&PortalContentURL=https%3a%2f%2fais-cs.ucsc.edu%2fpsc%2fcsprd%2fEMPLOYEE%2fPSFT_CSPRD%2fc%2fSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL&PortalContentProvider=PSFT_CSPRD&PortalCRefLabel=My%20Student%20Center%20Page&PortalRegistryName=EMPLOYEE&PortalServletURI=https%3a%2f%2fmy.ucsc.edu%2fpsp%2fep9prd%2f&PortalURI=https%3a%2f%2fmy.ucsc.edu%2fpsc%2fep9prd%2f&PortalHostNode=EMPL&NoCrumbs=yes&PortalKeyStruct=yes', null, 'https://my.ucsc.edu/psp/ep9prd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL?FolderPath=PORTAL_ROOT_OBJECT.SCEP_MY_STUDENT_CENTER.SCEP_STUDENT_CENTER&IsFolder=false&IgnoreParamTempl=FolderPath%2cIsFolder')
                })
            })
            .then(function(frame) {
                // the myAcad frame page contains a hidden form to validate users, we will now use cheerio to extarct them
                var obj = getHiddenForm(frame.body);
                obj.ICAction = 'DERIVED_SSS_SCR_SSS_LINK_ANCHOR5';
                return myucscRequest(ua, cookie, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL', obj, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL?FolderPath=PORTAL_ROOT_OBJECT.SCEP_MY_STUDENT_CENTER.SCEP_STUDENT_CENTER&IsFolder=false&IgnoreParamTempl=FolderPath%2cIsFolder&PortalActualURL=https%3a%2f%2fais-cs.ucsc.edu%2fpsc%2fcsprd%2fEMPLOYEE%2fPSFT_CSPRD%2fc%2fSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL&PortalContentURL=https%3a%2f%2fais-cs.ucsc.edu%2fpsc%2fcsprd%2fEMPLOYEE%2fPSFT_CSPRD%2fc%2fSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL&PortalContentProvider=PSFT_CSPRD&PortalCRefLabel=My%20Student%20Center%20Page&PortalRegistryName=EMPLOYEE&PortalServletURI=https%3a%2f%2fmy.ucsc.edu%2fpsp%2fep9prd%2f&PortalURI=https%3a%2f%2fmy.ucsc.edu%2fpsc%2fep9prd%2f&PortalHostNode=EMPL&NoCrumbs=yes&PortalKeyStruct=yes')
            })
            .then(function(redirect) {
                return myucscRequest(ua, cookie, redirect.headers.location, null, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL?FolderPath=PORTAL_ROOT_OBJECT.SCEP_MY_STUDENT_CENTER.SCEP_STUDENT_CENTER&IsFolder=false&IgnoreParamTempl=FolderPath%2cIsFolder&PortalActualURL=https%3a%2f%2fais-cs.ucsc.edu%2fpsc%2fcsprd%2fEMPLOYEE%2fPSFT_CSPRD%2fc%2fSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL&PortalContentURL=https%3a%2f%2fais-cs.ucsc.edu%2fpsc%2fcsprd%2fEMPLOYEE%2fPSFT_CSPRD%2fc%2fSA_LEARNER_SERVICES.SSS_STUDENT_CENTER.GBL&PortalContentProvider=PSFT_CSPRD&PortalCRefLabel=My%20Student%20Center%20Page&PortalRegistryName=EMPLOYEE&PortalServletURI=https%3a%2f%2fmy.ucsc.edu%2fpsp%2fep9prd%2f&PortalURI=https%3a%2f%2fmy.ucsc.edu%2fpsc%2fep9prd%2f&PortalHostNode=EMPL&NoCrumbs=yes&PortalKeyStruct=yes')
            })
            .then(function(myAcad) {
                var obj = getHiddenForm(myAcad.body);
                // Now "click" the unofficial transcript
                obj.ICAction = 'DERIVED_SSSACA2_SS_UNOFF_TRSC_LINK';
                obj['DERIVED_SSTSNAV_SSTS_MAIN_GOTO$7$'] = 9999;
                obj['DERIVED_SSTSNAV_SSTS_MAIN_GOTO$8$'] = 9999;
                obj.ptus_defaultlocalnode = 'PSFT_CSPRD';
                obj.ptus_dbname = 'CSPRD';
                obj.ptus_portal = 'EMPLOYEE';
                obj.ptus_node = 'PSFT_CSPRD';
                obj.ptus_workcenterid = '';
                obj.ptus_componenturl = 'https://ais-cs.ucsc.edu/psp/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_MY_ACAD.GBL';
                return myucscRequest(ua, cookie, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_MY_ACAD.GBL', obj, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_MY_ACAD.GBL?Page=SSS_MY_ACAD&Action=U&ExactKeys=Y&TargetFrameName=None')
            })
            .then(function(redirect) {
                var refererUnique = redirect.headers.location;
                return myucscRequest(ua, cookie, refererUnique, null, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_MY_ACAD.GBL?Page=SSS_MY_ACAD&Action=U&ExactKeys=Y&TargetFrameName=None')
                .then(function(transcriptPage) {
                    var obj = getHiddenForm(transcriptPage.body);
                    // Now "select" HTML
                    obj.ICAJAX = 1;
                    obj.ICNAVTYPEDROPDOWN = 1;
                    obj.ICAction = 'DERIVED_SSTSRPT_TSCRPT_TYPE3';
                    obj['DERIVED_SSTSNAV_SSTS_MAIN_GOTO$7$'] = 9999;
                    obj.SA_REQUEST_HDR_INSTITUTION = 'UCSCM';
                    obj.DERIVED_SSTSRPT_TSCRPT_TYPE3 = 'UHTML';
                    obj['DERIVED_SSTSNAV_SSTS_MAIN_GOTO$8$'] = 9999;
                    obj.ptus_defaultlocalnode = 'PSFT_CSPRD';
                    obj.ptus_dbname = 'CSPRD';
                    obj.ptus_portal = 'EMPLOYEE';
                    obj.ptus_node = 'PSFT_CSPRD';
                    obj.ptus_workcenterid = '';
                    obj.ptus_componenturl = 'https://ais-cs.ucsc.edu/psp/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_TSRQST_UNOFF.GBL';
                    return myucscRequest(ua, cookie, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_TSRQST_UNOFF.GBL', obj, refererUnique)
                    .then(function(transcriptPage2) {
                        obj.ICStateNum = obj.ICStateNum++;
                        obj.ICAction = 'GO';
                        console.log('Requested for transcript...')
                        return myucscRequest(ua, cookie, 'https://ais-cs.ucsc.edu/psc/csprd/EMPLOYEE/PSFT_CSPRD/c/SA_LEARNER_SERVICES.SSS_TSRQST_UNOFF.GBL', obj, refererUnique)
                    })
                    .then(function(end) {
                        var CDATA = end.body.match(/<!\[CDATA\[(.*)]]>/);
                        if (!CDATA || !CDATA[1] || CDATA[1].indexOf('window.open') === -1) {
                            console.error('No window.open() Found')
                            return false;
                        }
                        var args = /\(\s*([^)]+?)\s*\)/.exec(CDATA[1]);
                        if (!args[1]) {
                            console.error('Parse Error')
                            return false;
                        }
                        args = args[1].split(/\s*,\s*/);
                        var transcriptURL = args[0]
                        transcriptURL = transcriptURL.substring(1, transcriptURL.length - 1);
                        return myucscRequest(ua, cookie, transcriptURL, null, refererUnique)
                        .then(function(transcript) {
                            return transcript.body;
                        })
                    })
                })
            })
        })
    })
}

var parseTranscriptHTML = function(html) {
    try {
        var $ = cheerio.load(html);

        var dom = $('.c41 .c25 .c40 .c11 b');
        var info = $('.c19 .c11 b');
        var g = $('.c46 .c65 .c39 .c45 .c25')
        var all = {};

        Object.keys(dom).forEach(function(index) {
            if (dom[index].children) {
                if (dom[index].children[0]) {
                    // Yes, I know this is ugly, but it works
                    var classes = $(dom[index].parent.parent.parent.parent.parent.parent.parent.parent.next.next).find('.c45 .c25 .c6 .c11');
                    var counter = 0;
                    var courses = [];
                    var name = '';
                    var obj = {};
                    Object.keys(classes).forEach(function(index) {
                        if (classes[index].children) {
                            if (classes[index].children[0]) {
                                if (counter === 3) counter = 0;
                                if (counter === 0) {
                                    name = classes[index].children[0].data;
                                }else if (counter === 1) {
                                    name = name + classes[index].children[0].data;
                                    obj[name] = null;
                                    if (classes[index].parent.parent.parent.children[11].children && classes[index].parent.parent.parent.children[11].children[0]) {
                                        obj[name] = classes[index].parent.parent.parent.children[11].children[0].children[0].children[0].data;
                                    }
                                    courses.push(obj)
                                    name = '';
                                    obj = {};
                                }
                                counter++;
                            }
                        }
                    })
                    all[dom[index].children[0].data] = courses;
                }
            }
        })

        var studentName = '';
        var studentID = '';

        Object.keys(info).forEach(function(index) {
            if (info[index].children && info[index].children[0]) {
                if (info[index].children[0].data.indexOf('Name') !== -1) {
                    studentName = info[index].children[0].data.replace(/\s+/, "")
                    studentName = studentName.substring(studentName.indexOf(':') + 1)
                }
                if (info[index].children[0].data.indexOf('Student ID') !== -1) {
                    studentID = info[index].children[0].data.replace(/\s+/, "").match(/\d+/)[0]
                }
            }
        })

        var career = {};

        Object.keys(g).forEach(function(index) {
            if (g[index].children &&
                g[index].children[1] &&
                g[index].children[1].children &&
                g[index].children[1].children[0] &&
                g[index].children[1].children[0].children &&
                g[index].children[1].children[0].children[0] &&
                g[index].children[1].children[0].children[0].children &&
                g[index].children[1].children[0].children[0].children[0]
            ) {
                career[( g[index].children[1].children[0].children[0].children[0].data.indexOf('Transfer') !== -1 ? 'transferGPA' :
                    (g[index].children[1].children[0].children[0].children[0].data.indexOf('Comb') !== -1 ? 'combinedGPA' :
                        'courseGPA'
                    )
                )] = g[index].children[3].children[0] ? g[index].children[3].children[0].children[0].children[0].data : null;

                career[( g[index].children[5].children[0].children[0].children[0].data.indexOf('Transfer') !== -1 ? 'transferUnits' :
                    (g[index].children[5].children[0].children[0].children[0].data.indexOf('Comb') !== -1 ? 'combindUnits' :
                        'courseUnits'
                    )
                )] = {
                    attempted: g[index].children[7].children[0].children[0].children[0].data,
                    earned: g[index].children[9].children[0].children[0].children[0].data,
                    gpaUnits: g[index].children[11].children[0].children[0].children[0].data,
                    points: g[index].children[13].children[0].children[0].children[0].data
                }
            }
        })

        return {
            name: studentName,
            studentID: studentID,
            courses: all,
            career: career
        }
    }catch(e) {
        return false;
    }
}

var getTranscript = function(username, password) {
    return getTranscriptHTML(username, password).then(function(html) {
        if (html === false) return false;
        return parseTranscriptHTML(html);
    })
}

var getFinalRawDom = function() {
    return plainRequest('http://registrar.ucsc.edu/soc/final-examinations.html')
}

var quarterToNum = function(quarter) {
    switch (quarter.toLowerCase()) {
        case 'fall':
        return '8';
        break;
        case 'winter':
        return '0';
        break;
        case 'spring':
        return '2';
        break;
        case 'summer':
        return '4';
        break;
        default:
        return null;
        break;
    }
}

var nameToCode = function(quarter, year) {
    return '2' + year.slice(2) + quarterToNum(quarter);
}

var parseFinalDOM = function(body) {
    var $ = cheerio.load(body);
    var tables = $('.contentBox').find('table');
    var body = null, split = [], rows = [], Class, Start, ExamDate, ExamTimes, obj = {};
    var finals = {}
    for (var i = 0, length = tables.length; i < length; i++) {
        body = $(tables[i]).children().first();
        // Since someone obviously didn't do their jobs properly, I can't use the ID identifier
        if ($(body).children().first().text().trim().indexOf('Block') !== -1) continue;
        split = $(body).children().first().text().trim().split(' ');
        finals[nameToCode(split[0], split[1])] = [];
        rows = $(body).find('tr');
        for (var r = 0, length1 = rows.length; r < length1; r++) {
            Class = $($(rows[r]).children().get(0)).text().trim();
            Start = $($(rows[r]).children().get(1)).text().trim();
            ExamDate = $($(rows[r]).children().get(2)).text().trim();
            ExamTimes = $($(rows[r]).children().get(3)).text().trim();
            if (Class === 'Class' || !Class || !ExamDate || !ExamTimes) continue;
            obj = {
                days: [],
                hash: '',
                date: {},
                time: ''
            }
            if (Class.indexOf('M') !== -1) obj.days.push('Monday')
            if (Class.indexOf('Tu') !== -1) obj.days.push('Tuesday')
            if (Class.indexOf('W') !== -1) obj.days.push('Wednesday')
            if (Class.indexOf('Th') !== -1) obj.days.push('Thursday')
            if (Class.indexOf('F') !== -1) obj.days.push('Friday')
            if (!Start) {
                obj.hash = Class;
            }else{
                obj.hash = obj.days.join('-') + '-' + twelveTo24(Start.replace(/[^0-9a-zA-Z:]/g, '').toUpperCase());
            }
            delete obj.days;
            obj.date = ExamDate;
            obj.time = ExamTimes;
            finals[nameToCode(split[0], split[1])].push(obj)
        }
    }
    return finals;
}

var getFinalSchedule = function() {
    return getFinalRawDom().then(function(body) {
        var course = parseFinalDOM(body);
        return course;
    })
}

var buildDirectoryRequestData = function(csfr, keyword) {
    return {
        'CSRFName': csfr.name,
        'CSRFToken': csfr.token,
        'data[cn][0]': '',
        'data[givenname][0]': '',
        'data[sn][0]': keyword,
        'data[title][0]': '',
        'data[telephonenumber][0]': '',
        'data[mail][0]': '',
        'data[ucscpersonpubalternatemail][0]': '',
        affiliation: 'All',
        'data[ucscpersonpubdivision][0]': '',
        'data[ucscpersonpubdepartmentnumber][0]': '',
        'data[ucscpersonpubexpertisereference][0]': '',
        'data[ucscpersonpubmailstop][0]': '',
        'Action': 'Search directory'
    }
}

var matchDirectory = function(context, keyword, hint, department) {
    var match = {
        matches: [],
        bestGuess: {}
    }
    match.matches = context.results.filter(function(line) {
        if (line.affiliation === 'Undergraduate') {
            return false
        }
        if (line.affiliation === 'Staff') {
            return false
        }
        if (line.affiliation === 'Contractor') {
            return false
        }
        if (line.affiliation === 'Member') {
            return false
        }
        if (line.name.slice(line.name.lastIndexOf(' ') + 1).toLowerCase() === keyword.toLowerCase()) {
            return line
        }
    })

    var similarityMatches = []
    if (typeof department !== 'undefined') {
        similarityMatches = match.matches.filter(function(result) {
            return stringSimilarity.compareTwoStrings(
                    result.department.split(' ').slice(0, -1).join(' '),
                    department
                ) > 0.35
        })
    }
    if (similarityMatches.length === 0) similarityMatches = match.matches
    if (similarityMatches.length === 1) {
        // Even this will have discrenpancy.... I can't deal with all possibilities
        match.bestGuess = similarityMatches[0]
        return match
    }
    for (var i = 0; i < similarityMatches.length; i++) {
        if (similarityMatches[i].name.slice(0, 1).toLowerCase() === hint.slice(0, 1).toLowerCase()) {
            match.bestGuess = similarityMatches[i]
        }
    }

    return match
}

var parseDirectory = function(body) {
    var $ = cheerio.load(body);
    var context = {
        CSRF: {
            token: null,
            name: null
        },
        results: []
    }
    $('#advancedForm input').each(function(i, ele) {
        if ($(this).attr('name') === 'CSRFName') context.CSRF.name = $(this).attr('value')
        if ($(this).attr('name') === 'CSRFToken') context.CSRF.token = $(this).attr('value')
    })

    var line = {}
    $('table#dresults tbody tr').each(function(i, ele) {
        $(this).find('td').each(function(i, ele) {
            switch (i) {
                case 0:
                line.name = $(this).text().trim()
                break;
                case 3:
                line.department = $(this).text().trim()
                break;
                case 5:
                line.affiliation = $(this).text().trim()
                break;
                default:
                break;
            }
        })
        context.results.push(line)
        line = {}
    })

    return context
}

var directoryCSRF = {}
var directoryInitialSetup = false;

var getDirectoryCSRF = function() {
    if (directoryInitialSetup === false) {
        return secureDirectoryRequest(undefined, true).then(function(body) {
            var parsed = parseDirectory(body)
            if (typeof parsed.CSRF === 'undefined' || typeof parsed.CSRF.token === 'undefined') {
                return Promise.reject('No CSRF was found.')
            }
            directoryCSRF = parsed.CSRF
            directoryInitialSetup = true
            return directoryCSRF
        })
    }else{
        return Promise.resolve(directoryCSRF)
    }
}

var searchFacultyOnDirectoryByLastname = function(keyword, hint, department) {
    return getDirectoryCSRF().then(function(csrf) {
        return secureDirectoryRequest(buildDirectoryRequestData(csrf, keyword), true)
        .then(function(body) {
            var context = parseDirectory(body)
            if (typeof context.CSRF === 'undefined' || typeof context.CSRF.token === 'undefined') {
                return Promise.reject('No CSRF was found.')
            }
            directoryCSRF = context.CSRF
            return matchDirectory(context, keyword, hint, department)
        })
    })
}

module.exports = {
    getSubjects: getSubjects,
    getTerms: getTerms,
    getCourses: getCourses,
    getCourse: getCourse,
    getSeats: getSeats,
    getGEDesc: getGEDesc,
    getObjByLastName: getObjByLastName,
    getObjByFullName: getObjByFullName,
    getRateMyProfessorScoresByTid: getRateMyProfessorScoresByTid,
    getRateMyProfessorRatingsByTid: getRateMyProfessorRatingsByTid,
    getMaps: getMaps,
    test: testReq,
    calculateTermName: calculateTermName,
    calculateNextTermCode: calculateNextTermCode,
    getTranscriptHTML: getTranscriptHTML,
    parseTranscriptHTML: parseTranscriptHTML,
    getTranscript: getTranscript,
    getMajorMinor: getMajorMinor,
    getFinalSchedule: getFinalSchedule,
    searchFacultyOnDirectoryByLastname: searchFacultyOnDirectoryByLastname
}
