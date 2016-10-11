var Promise = require('bluebird');
var cheerio = require('cheerio');
var url = require('url');
var unserialize = require('./unserialize');
var serialize = require('./serialize');
var Base64={_keyStr:"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",encode:function(e){var t="";var n,r,i,s,o,u,a;var f=0;e=Base64._utf8_encode(e);while(f<e.length){n=e.charCodeAt(f++);r=e.charCodeAt(f++);i=e.charCodeAt(f++);s=n>>2;o=(n&3)<<4|r>>4;u=(r&15)<<2|i>>6;a=i&63;if(isNaN(r)){u=a=64}else if(isNaN(i)){a=64}t=t+this._keyStr.charAt(s)+this._keyStr.charAt(o)+this._keyStr.charAt(u)+this._keyStr.charAt(a)}return t},decode:function(e){var t="";var n,r,i;var s,o,u,a;var f=0;e=e.replace(/[^A-Za-z0-9+/=]/g,"");while(f<e.length){s=this._keyStr.indexOf(e.charAt(f++));o=this._keyStr.indexOf(e.charAt(f++));u=this._keyStr.indexOf(e.charAt(f++));a=this._keyStr.indexOf(e.charAt(f++));n=s<<2|o>>4;r=(o&15)<<4|u>>2;i=(u&3)<<6|a;t=t+String.fromCharCode(n);if(u!=64){t=t+String.fromCharCode(r)}if(a!=64){t=t+String.fromCharCode(i)}}t=Base64._utf8_decode(t);return t},_utf8_encode:function(e){e=e.replace(/rn/g,"n");var t="";for(var n=0;n<e.length;n++){var r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r)}else if(r>127&&r<2048){t+=String.fromCharCode(r>>6|192);t+=String.fromCharCode(r&63|128)}else{t+=String.fromCharCode(r>>12|224);t+=String.fromCharCode(r>>6&63|128);t+=String.fromCharCode(r&63|128)}}return t},_utf8_decode:function(e){var t="";var n=0;var r=c1=c2=0;while(n<e.length){r=e.charCodeAt(n);if(r<128){t+=String.fromCharCode(r);n++}else if(r>191&&r<224){c2=e.charCodeAt(n+1);t+=String.fromCharCode((r&31)<<6|c2&63);n+=2}else{c2=e.charCodeAt(n+1);c3=e.charCodeAt(n+2);t+=String.fromCharCode((r&15)<<12|(c2&63)<<6|c3&63);n+=3}}return t}}
var maps = {
    classrooms: 'http://maps.ucsc.edu/content/all-classrooms',
    //colleges: 'http://maps.ucsc.edu/content/all-colleges',
    departments: 'http://maps.ucsc.edu/content/academic-departments',
    dining: 'http://maps.ucsc.edu/content/all-dining',
    libraries: 'http://maps.ucsc.edu/content/all-libraries'
};
var request = require('request').defaults({
    pool: {
        maxSockets: process.env.NUMSOCKETS ? process.env.NUMSOCKETS : 20
    },
    timeout: 180 * 1000
});
var j = require('request').jar();
var pkg = require('./package.json')

var contactInfo = (typeof process.env.CONTACT === 'undefined' ? 'User did not specify his/her contact information' : process.env.CONTACT)
var ua = 'UCSC Course Data Fetcher/' + pkg.version + ' ' + contactInfo;

if (process.env.SOCKS) {
    var sAgent = require('socks5-https-client/lib/Agent');
    var Agent = require('socks5-http-client/lib/Agent');
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
        var terms = $('#term_dropdown')[0].children;

        var actualTerms = [];

        for (var i = 0, length = terms.length; i < length; i++) {
            if (terms[i].attribs && terms[i].children) {
                actualTerms.push({
                    code: terms[i].attribs.value,
                    name: terms[i].children[0].data
                });
            }
        }
        return actualTerms;
    })
}

var getCoursesRawDom = function(termId, limit) {
    return secureRequest('https://pisa.ucsc.edu/class_search/index.php', {
        'action': 'results',
        'binds[:term]': termId,
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
    }, true)
    .then(function(body) {
        return secureRequest('https://pisa.ucsc.edu/class_search/index.php', {
            'action': 'update_segment',
            'Rec_Dur': limit || 25
        }, true)
    })
}

var getCourseRawDom = function(termId, courseNumber) {
    return secureRequest('https://pisa.ucsc.edu/class_search/index.php?action=detail&class_data=' + encodeURIComponent(Base64.encode(serialize({
        STRM: termId,
        CLASS_NBR: courseNumber
    }))))
}

var getGEDescRawDom = function() {
    return plainRequest('http://registrar.ucsc.edu/navigator/section3/gened/beginning2010/gen-ed-codes/index.html')
}

var searchOnRateMyProfessorRawDom = function(firstName, lastName) {
    return plainRequest('http://www.ratemyprofessors.com/search.jsp?query=' + encodeURIComponent([firstName, lastName, 'Santa', 'Cruz'].join(' ')));
}

var fetchRateMyProfessorRawDom = function(tid) {
    return plainRequest('http://www.ratemyprofessors.com/ShowRatings.jsp?tid=' + tid)
}

var fetchRateMyProfessorJSONAll = function(tid) {
    var array = [];
    var fetch = function(tid, page) {
        page = page || 1;
        return plainRequest('http://www.ratemyprofessors.com/paginate/professors/ratings?tid=' + tid + '&page=' + page)
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
    var listingDom = $('ul.listings');
    if (listingDom.length === 0) return null;
    // TODO: stop being so ugly
    var name = listingDom[0].children[3].children[1].children[3].children[1].children[0].data.trim();
    var school = listingDom[0].children[3].children[1].children[3].children[3].children[0].data.trim();

    if (school.toLowerCase().indexOf('santa cruz') === -1) return null;

    var href = listingDom[0].children[3].children[1].attribs.href;
    return {
        name: name,
        tid: href.substring(href.lastIndexOf('=') + 1)
    }
}

var parseRateMyProfessorFromSelector = function(body) {
    var $ = cheerio.load(body);
    var scoreDom = $('.rating-breakdown')
    var rating = {};

    var overallDom = $('.breakdown-container', scoreDom)
    var breakDownDom = $('.breakdown-section', scoreDom)
    try {

        rating.overall = overallDom[0].children[1].children[1].children[0].data;
        //console.log('WOULD TAKE AGAIN'.toLowerCase(), breakDownDom[0].children[1].children[0].data.trim());
        rating.again = breakDownDom[0].children[1].children[0].data.trim();
        //console.log('LEVEL OF DIFFICULTY'.toLowerCase(0), breakDownDom[1].children[1].children[0].data.trim());
        rating.difficulty = breakDownDom[1].children[1].children[0].data.trim();

        rating.tags = [];

        var tagsDom = $('.tag-box-choosetags');
        for (var i = 0, length = tagsDom.length; i < length; i++) {
            rating.tags.push({
                tag: tagsDom[i].children[0].data.trim().toLowerCase(),
                count: tagsDom[i].children[1].children[0].data.match(/\d+/g)[0]
            })
            //console.log(tagsDom[i].children[0].data.trim().toLowerCase(), ':', tagsDom[i].children[1].children[0].data.match(/\d+/g)[0]);
        }

        var ratingCountDom = $('.rating-count');
        //console.log(ratingCountDom[0].children[0].data.match(/\d+/g)[0]);
        rating.count = ratingCountDom[0].children[0].data.match(/\d+/g)[0];
    }catch(e) {

    }

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


var getRateMyProfessorScoresByFullName = function(firstName, lastName) {
    var fetch = function(obj) {
        return fetchRateMyProfessorRawDom(obj.tid).then(function(body) {
            return {
                name: obj.name,
                scores: parseRateMyProfessorFromSelector(body)
            }
        })
    }
    return getObjByFullName(firstName, lastName).then(function(obj) {
        if (obj === null) {
            return null;
        }
        return fetch(obj);
    })
}

var getRateMyProfessorScoresByLastName = function(firstName, lastName) {
    var fetch = function(obj) {
        return fetchRateMyProfessorRawDom(obj.tid).then(function(body) {
            return {
                name: obj.name,
                scores: parseRateMyProfessorFromSelector(body)
            }
        })
    }
    return getObjByLastName(firstName, lastName).then(function(obj) {
        if (obj === null) {
            return null;
        }
        return fetch(obj);
    })
}

var getRateMyProfessorRatingsByFullName = function(firstName, lastName) {
    var fetch = function(obj) {
        return fetchRateMyProfessorJSONAll(obj.tid).then(function(ratings) {
            return {
                name: obj.name,
                tid: obj.tid,
                ratings: ratings
            }
        })
    }
    return getObjByFullName(firstName, lastName).then(function(obj) {
        if (obj === null) {
            return null;
        }
        return fetch(obj);
    })
}

var getRateMyProfessorRatingsByLastName = function(lastName) {
    var fetch = function(obj) {
        return fetchRateMyProfessorJSONAll(obj.tid).then(function(ratings) {
            return {
                name: obj.name,
                tid: obj.tid,
                ratings: ratings
            }
        })
    }
    return getObjByLastName(lastName).then(function(obj) {
        if (obj === null) {
            return null;
        }
        return fetch(obj);
    })
}

var parseGEDescDOMFromSelector = function(body) {
    var $ = cheerio.load(body);
    var tableDom = $('tr', $('.contentBox'));
    var geDesc = {};
    for (var i = 1, length = tableDom.length; i < length; i ++) {
        // TODO: less ugly please
        if (typeof tableDom[i].children[3] !== 'undefined' && typeof tableDom[i].children[3].children[1] !== 'undefined') {
            if (typeof tableDom[i].children[3].children[1].children[2] !== 'undefined') {
                geDesc[tableDom[i].children[3].children[1].children[2].children[0].data] = tableDom[i].children[1].children[1].children[0].data
            }
            geDesc[tableDom[i].children[3].children[1].children[0].children[0].data] = tableDom[i].children[1].children[1].children[0].data
        }
    }
    // http://registrar.ucsc.edu/navigator/section3/gened/beginning2010/gen-ed-codes/{code}-code.html
    return geDesc;
}

var parseEnrollmentDOMFromSelector = function(body) {
    var $ = cheerio.load(body);
    var bodyDom = $('.panel-group > .row > .panel-body');
    var course = {};
    // bodyDom[0] is the course information
    var infoDom = $('.col-xs-12', bodyDom[0])
    // infoDom[0] is the first column; infoDom[1] is the second column
    var enrollDD = $('dd', infoDom[1]);
    /*
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
    course.status = enrollDD[0].children[1].data.trim();
    course.avail = parseInt(enrollDD[1].children[0].data);
    course.cap = parseInt(enrollDD[2].children[0].data);
    course.enrolled = parseInt(enrollDD[3].children[0].data);
    course.waitcap = parseInt(enrollDD[4].children[0].data);
    course.wait = parseInt(enrollDD[5].children[0].data);

    return course;

}

var parseSeatsFromSelector = function(body) {
    var $ = cheerio.load(body);
    var bodyDom = $('.panel-group > .row > .panel-body');
    var seats = {};
    // bodyDom[0] is the course information
    var infoDom = $('.col-xs-12', bodyDom[0])
    // infoDom[0] is the first column; infoDom[1] is the second column
    var enrollDD = $('dd', infoDom[1]);

    /*
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

    seats.status = enrollDD[0].children[1].data.trim();
    seats.avail = parseInt(enrollDD[1].children[0].data);
    seats.cap = parseInt(enrollDD[2].children[0].data);
    seats.enrolled = parseInt(enrollDD[3].children[0].data);
    seats.waitCap = parseInt(enrollDD[4].children[0].data);
    seats.waitTotal = parseInt(enrollDD[5].children[0].data);

    var sectionDom = null;
    var numPossibleSectionDom = bodyDom.length;
    for (var i = 0; i < numPossibleSectionDom; i++) {
        if (typeof bodyDom[i] !== 'undefined' ) {
            // TODO: this is disgusting
            searchString = bodyDom[i].parent.children[1].children[0].children[0].data.toLowerCase();
            if (searchString.indexOf('discussion') !== -1) {
                sectionDom = $('.row', bodyDom[i]);
            }
            searchString = null;
        }
    }

    if (sectionDom !== null) {
        var sections = [];
        var section = {};
        var enrollment = '';
        var wati = '';
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
            split = sectionDom[i].children[1].children[0].data.split(' ');
            section.num = split[0].match(/\d+/g)[0];
            section.sec = split[2];
            enrollment = sectionDom[i].children[9].children[0].data.replace(/\s/g, "");
            wait = sectionDom[i].children[11].children[0].data
            section.status = sectionDom[i].children[13].children[1].data.trim();
            section.enrolled = parseInt(enrollment.substring(enrollment.indexOf(':') + 1, enrollment.indexOf('/')));
            section.cap = parseInt(enrollment.substring(enrollment.indexOf('/') + 1));
            section.wait = parseInt(wait.substring(wait.indexOf(':') + 1, wait.indexOf('/')));
            section.waitTotal = parseInt(wait.substring(wait.indexOf('/') + 1));
            sections.push(section);
            section = {};
        }
        seats.sec = sections;
    }

    return seats;

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
    course.ty = dd[3].children[0].data;
    course.cr = dd[4].children[0].data.match(/\d+/g)[0];
    course.ge = dd[5].children[0].data.replace(/\s/g, '').split(',');
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
                meetingInfoDom = $('table > tr', bodyDom[i]);
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
            if (sectionDom[i].children[3].children[0].data.replace(/^\s+/, "").substring(0, 3) === 'TBA') {
                classDataCompatibleTime = null;
            }else{
                split = sectionDom[i].children[3].children[0].data.replace(/^\s+/, "").split(' ');
                if (split[0].indexOf('M') !== -1) obj['MON'] = 'Y'
                if (split[0].indexOf('Tu') !== -1) obj['TUES'] = 'Y'
                if (split[0].indexOf('W') !== -1) obj['WED'] = 'Y'
                if (split[0].indexOf('Th') !== -1) obj['THURS'] = 'Y'
                if (split[0].indexOf('F') !== -1) obj['FRI'] = 'Y'
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

var parseDOMFromClassData = function(body) {
    var $ = cheerio.load(body);
    var dom = $('a', $('h2', $('.panel-default')))
    var courses = {};
    var obj = {};
    var classData = {};
    var numHeaders = dom.length;
    for (var i = 0; i < numHeaders; i++) {
        if (i % 2 === 0) {
            // classData Structure (PHP unserialized):
            /*
            {
                STRM: '2168',
                CLASS_NBR: '22623',
                CLASS_SECTION: '01',
                CLASS_MTG_NBR: '1',
                SESSION_CODE: '1',
                CLASS_STAT: 'A',
                SUBJECT: 'AMS',
                CATALOG_NBR: ' 217',
                DESCR: 'Intro Fluid Dynamics',
                SSR_COMPONENT: 'LEC',
                START_TIME: '09:50AM',
                END_TIME: '11:25AM',
                FAC_DESCR: 'J Baskin Engr 372',
                MON: 'N',
                TUES: 'Y',
                WED: 'N',
                THURS: 'Y',
                FRI: 'N',
                SAT: 'N',
                SUN: 'N',
                ENRL_STAT: 'C',
                WAIT_TOT: '0',
                ENRL_CAP: '35',
                ENRL_TOT: '24',
                LAST_NAME: 'Brummell',
                FIRST_NAME: 'Nicholas',
                MIDDLE_NAME: 'H',
                COMBINED_SECTION: 'C',
                TOPIC: null,
                DISPLAY_NAME: 'Brummell,N.H.'
            }
            */
            classData = unserialize(Buffer.from(decodeURIComponent(dom[i].attribs.href.substring(dom[i].attribs.href.lastIndexOf('=') + 1)), 'base64').toString('utf-8'));
            obj.c = classData.CATALOG_NBR.replace(/^\s+/,"");
            obj.s = classData.CLASS_SECTION;
            obj.loct = [];
        }else{
            obj.n = classData.DESCR;
            obj.num = parseInt(classData.CLASS_NBR);
            obj.loct.push({
                t: parseTime(classData),
                loc: classData.FAC_DESCR
            })
            //obj.ty = classData.SSR_COMPONENT;
            obj.cap = classData.ENRL_CAP;
            obj.ins = {
                d: classData.DISPLAY_NAME ? classData.DISPLAY_NAME.split('<br>') : [ 'Staff' ],
                f: classData.FIRST_NAME,
                l: classData.LAST_NAME,
                m: classData.MIDDLE_NAME
            };
            // material: http://slugstore.ucsc.edu/ePOS?form=schedule.html&term=FL16&department.0=WRIT&course.0=169&section.0=01

            if (typeof courses[classData.SUBJECT] === 'undefined') courses[classData.SUBJECT] = [];
            courses[classData.SUBJECT].push(obj);
            obj = {};
            classData = {};
        }
    }

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

var parseDOMFromSelector = function(body) {
    var courses = [];
    var obj = {};
    var $ = cheerio.load(body);
    var headers = $('a', $('h2', $('.panel-default')))
    var numHeaders = headers.length;
    for (var i = 0; i < numHeaders; i++) {
        if (i % 2 === 0) {
            obj.c = headers[i].children[0].data;
        } else {
            obj.n = headers[i].children[0].data;
            courses.push(obj);
            obj = {};
        }
    }

    var body = $('.panel-default > .panel-body > .row')

    var numBody = body.length;

    var parseLocation = [];
    var type = '';
    var location = '';
    var status = '';
    var classDataCompatibleTime = {};
    var split = [];
    for (var i = 0; i < numBody; i++) {

        if (typeof body[i].children[1].children[1].children[0] !== 'undefined') {
            courses[i].num = parseInt(body[i].children[1].children[1].children[0].data);
        }else{
            courses[i].num = null;
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

        if (body[i].children[7].children[2].data.replace(/^\s+/, "").substring(0, 3) === 'TBA') {
            classDataCompatibleTime = null;
        }else{
            split = body[i].children[7].children[2].data.replace(/^\s+/, "").split(' ');
            if (split[0].indexOf('M') !== -1) obj['MON'] = 'Y'
            if (split[0].indexOf('Tu') !== -1) obj['TUES'] = 'Y'
            if (split[0].indexOf('W') !== -1) obj['WED'] = 'Y'
            if (split[0].indexOf('Th') !== -1) obj['THURS'] = 'Y'
            if (split[0].indexOf('F') !== -1) obj['FRI'] = 'Y'
            split = split[1].split('-');
            obj.START_TIME = split[0];
            obj.END_TIME = split[1];
            classDataCompatibleTime = parseTime(obj);
            split = [];
        }
        obj = {};

        Object.assign(courses[i], {
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
    var parseCourse = [];

    for (var i = 0, numCourses = courses.length; i < numCourses; i++) {
        parseCourse = courses[i].c.split(' ');
        if (typeof actualCourses[parseCourse[0]] === 'undefined') actualCourses[parseCourse[0]] = [];
        courses[i].c = parseCourse[1]
        courses[i].s = parseCourse[3]
        actualCourses[parseCourse[0]].push(courses[i]);
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
        var courses = {};
        try {
            courses = parseDOMFromClassData(body);
        }catch(e) {
            courses = parseDOMFromSelector(body);
        }
        return courses;
    })
}

var getCourse = function(termId, classNumber) {
    return getCourseRawDom(termId, classNumber).then(function(body) {
        var course = parseCourseDOMFromSelector(body);
        return course;
    })
}

var getEnrollment = function(termId, classNumber) {
    return getCourseRawDom(termId, classNumber).then(function(body) {
        var course = parseEnrollmentDOMFromSelector(body);
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

module.exports = {
    getTerms: getTerms,
    getCourses: getCourses,
    getCourse: getCourse,
    getEnrollment: getEnrollment,
    getSeats: getSeats,
    getGEDesc: getGEDesc,
    getRateMyProfessorScoresByFullName: getRateMyProfessorScoresByFullName,
    getRateMyProfessorScoresByLastName: getRateMyProfessorScoresByLastName,
    getRateMyProfessorRatingsByFullName: getRateMyProfessorRatingsByFullName,
    getRateMyProfessorRatingsByLastName: getRateMyProfessorRatingsByLastName,
    getMaps: getMaps,
    test: testReq
}
