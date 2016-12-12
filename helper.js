var self = module.exports = {

    getYears: function(flatTermsList) {
        var tmp;
        var years = {};
        flatTermsList.forEach(function(term) {
            tmp = '20' + self.pad((term.code % 2000).toString().slice(0, -1), 2, 0);
            if (typeof years[tmp] === 'undefined') {
                years[tmp] = null;
            }
        })
        return Object.keys(years)
    },

    normalizeYears: function(allYears, quarterYears) {
        /*
            we will normalize the years, for example, allYears contains all the years (2004-2017) in an array
            and quarter years is an object of where the value is the number of classes offered in that quarter year
            the normalized obj will have either 1(true) or 0(false) to signify if it was offered or not
        */
        var normalized = {};
        var qYears = Object.keys(quarterYears);
        for (var i = 0, length = allYears.length; i < length; i++) {
            if (typeof normalized[allYears[i]] === 'undefined') normalized[allYears[i]] = 0;
            if (qYears.indexOf(allYears[i]) !== -1) normalized[allYears[i]] += quarterYears[allYears[i]];
        }
        var normalizedLargest = Object.keys(normalized).reduce(function(x,y){
            return (x > y) ? x : y;
        });
        var quarterYearLargest = qYears.reduce(function(x,y){
            return (x > y) ? x : y;
        });
        if (normalizedLargest != quarterYearLargest) {
            // account for quarter mismatch, where winter is jump to 2017, and skewing the results for other quarters
            // though it could introduce errors. we will see when we test this
            delete normalized[normalizedLargest];
        }
        return normalized;
    },

    windowFrequency: function(flatTermsList, historicData, windowSize) {

        var windowAlpha = 1 / windowSize;

        var allYears = self.getYears(flatTermsList);
        var normalized = {};
        var years = [];

        var Window = [];
        var period = 0;
        var frequency = 0;

        var threshold = {};
        var sum = 0;

        var result = {};

        var predictions = {
            fall: [],
            winter: [],
            spring: [],
            summer: []
        };

        for (var quarter in historicData){
            for (var code in historicData[quarter]) {
                if (typeof result[code] === 'undefined') {
                    result[code] = {
                        spring: 0,
                        summer: 0,
                        fall: 0,
                        winter: 0
                    }
                    threshold[code] = {
                        spring: 0,
                        summer: 0,
                        fall: 0,
                        winter: 0
                    }
                }
                normalized = self.normalizeYears(allYears, historicData[quarter][code]);
                // Warning, inefficient code ahead.
                years = Object.keys(normalized).sort(function(a, b) { return b-a; });

                threshold[code][quarter] = ((1 / windowSize) * windowAlpha).toPrecision(2)

                for (;; period++) {
                    Window = years.slice( period, period + windowSize );
                    if (Window.length < windowSize) break;

                    frequency = Window.reduce(function(total, year) {
                        return normalized[year] > 0 ? total + normalized[year] : total;
                    }, 0) / windowSize;

                    sum += frequency * Math.pow(1 - windowAlpha, period);
                }

                result[code][quarter] = (windowAlpha * sum).toPrecision(2)

                period = 0;
                sum = 0;
            }
        }

        Object.keys(result).forEach(function(code) {
            //console.log(code);
            Object.keys(result[code]).forEach(function(quarter) {
                //console.log(quarter, result[code][quarter], threshold[code][quarter], (result[code][quarter] > 0 && result[code][quarter] >= threshold[code][quarter]))
                if (result[code][quarter] > 0 && result[code][quarter] >= threshold[code][quarter]) {
                    predictions[quarter].push(code);
                }
            })
            //console.log('---')
            //console.log('')
        })
        return predictions;
    },

    pad: function(n, width, z) {
        z = z || '0';
        n = n + '';
        return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    }, // http://stackoverflow.com/questions/10073699/pad-a-number-with-leading-zeros-in-javascript

}
