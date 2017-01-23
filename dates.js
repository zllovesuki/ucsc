/*

Instruction begins till add/drop/swap deadline:

Only Working Days (Mon-Fri):
Fall:   15 Days
Winter: 14-17 Days, most likely 16 Days
Spring: 14 Days

Just Days (including weekends):
Fall:   20 Days
Winter: 21 Days (exception being 2016-17 being 18 days)
Spring: 18 Days

-*-

Enrollment starts before instruction begins:

Only Working Days (Mon-Fri):
Fall:   93 Days (exception for 2012-2015 being 98 days for some reasons)
Winter: 38-46 Days *wtf*
Spring: 24 Days (exception being 2016-17 being 25 days)

Just Days (including weekends):
Fall:   129 Days (exception for 2012-2015 being 136 days for some reasons)
Winter: 53-63 Days *wtf*
Spring: 33 Days (exception being 2016-17 being 35 days)

-*-

Leap years, Veterans Day don't seem to affect these numbers

*/

var compare = {
    '2008-09': {
        fall: {
            eBegins:  '2008-05-19',
            qBegins:  '2008-09-20',
            iBegins:  '2008-09-25',
            iEnds:    '2008-12-05',
            qEnds:    '2008-12-11',
            deadline: '2008-10-15'
        },
        winter: {
            eBegins:  '2008-11-13',
            qBegins:  '2009-01-05',
            iBegins:  '2009-01-06',
            iEnds:    '2009-03-16',
            qEnds:    '2009-03-20',
            deadline: '2009-01-27'
        },
        spring: {
            eBegins:  '2009-02-25',
            qBegins:  '2009-03-30',
            iBegins:  '2009-03-30',
            iEnds:    '2009-06-05',
            qEnds:    '2009-06-11',
            deadline: '2009-04-17'
        },
    },
    '2009-10': {
        fall: {
            eBegins:  '2009-05-18',
            qBegins:  '2009-09-19',
            iBegins:  '2009-09-24',
            iEnds:    '2009-12-04',
            qEnds:    '2009-12-10',
            deadline: '2009-10-14'
        },
        winter: {
            eBegins:  '2009-11-13',
            qBegins:  '2010-01-04',
            iBegins:  '2010-01-05',
            iEnds:    '2010-03-15',
            qEnds:    '2010-03-19',
            deadline: '2010-01-26'
        },
        spring: {
            eBegins:  '2010-02-24',
            qBegins:  '2010-03-29',
            iBegins:  '2010-03-29',
            iEnds:    '2010-06-04',
            qEnds:    '2010-06-10',
            deadline: '2010-04-16'
        },
    },
    '2010-11': {
        fall: {
            eBegins:  '2010-05-17',
            qBegins:  '2010-09-18',
            iBegins:  '2010-09-23',
            iEnds:    '2010-12-03',
            qEnds:    '2010-12-09',
            deadline: '2010-10-13'
        },
        winter: {
            eBegins:  '2010-11-12',
            qBegins:  '2011-01-03',
            iBegins:  '2011-01-04',
            iEnds:    '2011-03-14',
            qEnds:    '2011-03-18',
            deadline: '2011-01-25'
        },
        spring: {
            eBegins:  '2011-02-23',
            qBegins:  '2011-03-28',
            iBegins:  '2011-03-28',
            iEnds:    '2011-06-03',
            qEnds:    '2011-06-09',
            deadline: '2011-04-15'
        },
    },
    '2011-12': {
        fall: {
            eBegins:  '2011-05-16',
            qBegins:  '2011-09-17',
            iBegins:  '2011-09-22',
            iEnds:    '2011-12-02',
            qEnds:    '2011-12-08',
            deadline: '2011-10-12'
        },
        winter: {
            eBegins:  '2011-11-14',
            qBegins:  '2012-01-06',
            iBegins:  '2012-01-09',
            iEnds:    '2012-03-16',
            qEnds:    '2012-03-22',
            deadline: '2012-01-30'
        },
        spring: {
            eBegins:  '2012-02-29',
            qBegins:  '2012-04-02',
            iBegins:  '2012-04-02',
            iEnds:    '2012-06-08',
            qEnds:    '2012-06-14',
            deadline: '2012-04-20'
        },
    },
    '2012-13': {
        fall: {
            eBegins:  '2012-05-14',
            qBegins:  '2012-09-22',
            iBegins:  '2012-09-27',
            iEnds:    '2012-12-07',
            qEnds:    '2012-12-13',
            deadline: '2012-10-17'
        },
        winter: {
            eBegins:  '2012-11-13',
            qBegins:  '2013-01-04',
            iBegins:  '2013-01-07',
            iEnds:    '2013-03-18',
            qEnds:    '2013-03-22',
            deadline: '2013-01-28'
        },
        spring: {
            eBegins:  '2013-02-27',
            qBegins:  '2013-04-01',
            iBegins:  '2013-04-01',
            iEnds:    '2013-06-07',
            qEnds:    '2013-06-13',
            deadline: '2013-04-19'
        },
    },
    '2013-14': {
        fall: {
            eBegins:  '2013-05-13',
            qBegins:  '2013-09-21',
            iBegins:  '2013-09-26',
            iEnds:    '2013-12-06',
            qEnds:    '2013-12-12',
            deadline: '2013-10-16'
        },
        winter: {
            eBegins:  '2013-11-14',
            qBegins:  '2014-01-03',
            iBegins:  '2014-01-06',
            iEnds:    '2014-03-17',
            qEnds:    '2014-03-21',
            deadline: '2014-01-27'
        },
        spring: {
            eBegins:  '2014-02-26',
            qBegins:  '2014-03-31',
            iBegins:  '2014-03-31',
            iEnds:    '2014-06-06',
            qEnds:    '2014-06-12',
            deadline: '2014-04-18'
        },
    },
    '2014-15': {
        fall: {
            eBegins:  '2014-05-19',
            qBegins:  '2014-09-27',
            iBegins:  '2014-10-02',
            iEnds:    '2014-12-12',
            qEnds:    '2014-12-18',
            deadline: '2014-10-22'
        },
        winter: {
            eBegins:  '2014-11-13',
            qBegins:  '2015-01-05',
            iBegins:  '2015-01-05',
            iEnds:    '2015-03-16',
            qEnds:    '2015-03-20',
            deadline: '2015-01-26'
        },
        spring: {
            eBegins:  '2015-02-25',
            qBegins:  '2015-03-30',
            iBegins:  '2015-03-30',
            iEnds:    '2015-06-05',
            qEnds:    '2015-06-11',
            deadline: '2015-04-17'
        },
    },
    '2015-16': {
        fall: {
            eBegins:  '2015-05-18',
            qBegins:  '2015-09-19',
            iBegins:  '2015-09-24',
            iEnds:    '2015-12-04',
            qEnds:    '2015-12-10',
            deadline: '2015-10-14'
        },
        winter: {
            eBegins:  '2015-11-09',
            qBegins:  '2016-01-04',
            iBegins:  '2016-01-04',
            iEnds:    '2016-03-11',
            qEnds:    '2016-03-17',
            deadline: '2016-01-25'
        },
        spring: {
            eBegins:  '2016-02-24',
            qBegins:  '2016-03-28',
            iBegins:  '2016-03-28',
            iEnds:    '2016-06-03',
            qEnds:    '2016-06-09',
            deadline: '2016-04-15'
        }
    },
    '2016-17': {
        fall: {
            eBegins:  '2016-05-16',
            qBegins:  '2016-09-17',
            iBegins:  '2016-09-22',
            iEnds:    '2016-12-02',
            qEnds:    '2016-12-09',
            deadline: '2016-10-12'
        },
        winter: {
            eBegins:  '2016-11-07',
            qBegins:  '2017-01-06',
            iBegins:  '2017-01-09',
            iEnds:    '2017-03-17',
            qEnds:    '2017-03-24',
            deadline: '2017-01-27'
        },
        spring: {
            eBegins:  '2017-02-27',
            qBegins:  '2017-04-03',
            iBegins:  '2017-04-03',
            iEnds:    '2017-06-09',
            qEnds:    '2017-06-15',
            deadline: '2017-04-21'
        }
    }
}

function leapYear(year) {
    return ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
}

function workingDaysBetweenDates(startDate, endDate) {

    // Validate input
    if (endDate < startDate)
        return 0;

    // Calculate days between dates
    var millisecondsPerDay = 86400 * 1000; // Day in milliseconds
    startDate.setHours(0, 0, 0, 1); // Start just after midnight
    endDate.setHours(23, 59, 59, 999); // End just before midnight
    var diff = endDate - startDate; // Milliseconds between datetime objects
    var days = Math.ceil(diff / millisecondsPerDay);

    // Subtract two weekend days for every week in between
    var weeks = Math.floor(days / 7);
    days = days - (weeks * 2);

    // Handle special cases
    var startDay = startDate.getDay();
    var endDay = endDate.getDay();

    // Remove weekend not previously removed.
    if (startDay - endDay > 1)
        days = days - 2;

    // Remove start day if span starts on Sunday but ends before Saturday
    if (startDay == 0 && endDay != 6)
        days = days - 1

    // Remove end day if span ends on Saturday but starts after Sunday
    if (endDay == 6 && startDay != 0)
        days = days - 1

    return days;
}

function days_between(date1, date2) {

    // The number of milliseconds in one day
    var ONE_DAY = 1000 * 60 * 60 * 24

    // Convert both dates to milliseconds
    var date1_ms = date1.getTime()
    var date2_ms = date2.getTime()

    // Calculate the difference in milliseconds
    var difference_ms = Math.abs(date1_ms - date2_ms)

    // Convert back to days and return
    return Math.round(difference_ms / ONE_DAY)

}

['fall', 'winter', 'spring'].forEach(function(quarter) {
    console.log('---***---***---')
    console.log(quarter)
    console.log('***---***---***')
    for (var year in compare) {
        console.log('Year ' + year)
        console.log('Fall quarter in leap year?         ', leapYear(year.split('-')[0]));
        console.log('Winter/Spring quarter in leap year?', leapYear(parseInt(year.split('-')[0]) + 1));

        var veteransDayDate = new Date(year.split('-')[0] + '-11-11');

        console.log('Veterans Day was on: ' + (veteransDayDate.getDay() < 1 ? 'Next Monday' : veteransDayDate.getDay() > 5 ? 'This Friday' : 'Weekdays'))

        console.log('(Work) Enrollment <> qBeginning  = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].eBegins), new Date(compare[year][quarter].qBegins))
        )
        console.log('(Work) Enrollment <> iBeginning  = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].eBegins), new Date(compare[year][quarter].iBegins))
        )
        console.log('(Work) qBeginning <> Deadline    = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].qBegins), new Date(compare[year][quarter].deadline))
        )
        console.log('(Work) iBeginning <> Deadline    = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].iBegins), new Date(compare[year][quarter].deadline))
        )
        console.log('(Work) qBeginning <> iBeginning  = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].qBegins), new Date(compare[year][quarter].iBegins))
        )
        console.log('(Work) Days of Instructions      = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].iBegins), new Date(compare[year][quarter].iEnds))
        )
        console.log('(Work) qBeginning <> qEnd        = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].qBegins), new Date(compare[year][quarter].qEnds))
        )
        console.log('(Work) iEnd       <> qEnd        = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].iEnds), new Date(compare[year][quarter].qEnds))
        )
        console.log('(Work) Deadline   <> iEnd        = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].deadline), new Date(compare[year][quarter].iEnds))
        )
        console.log('(Work) Deadline   <> qEnd        = ' +
            workingDaysBetweenDates(new Date(compare[year][quarter].deadline), new Date(compare[year][quarter].qEnds))
        )

        console.log('---')
    }
})

console.log('*');
console.log('*');
console.log('*');

['fall', 'winter', 'spring'].forEach(function(quarter) {
    console.log('---***---***---')
    console.log(quarter)
    console.log('***---***---***')
    for (var year in compare) {
        console.log('Year ' + year)
        console.log('Fall quarter in leap year?         ', leapYear(year.split('-')[0]));
        console.log('Winter/Spring quarter in leap year?', leapYear(parseInt(year.split('-')[0]) + 1));

        var veteransDayDate = new Date(year.split('-')[0] + '-11-11');

        console.log('Veterans Day was on: ' + (veteransDayDate.getDay() < 1 ? 'Next Monday' : veteransDayDate.getDay() > 5 ? 'This Friday' : 'Weekdays'))

        console.log('(All)  Enrollment <> qBeginning  = ' +
            days_between(new Date(compare[year][quarter].eBegins), new Date(compare[year][quarter].qBegins))
        )
        console.log('(All)  Enrollment <> iBeginning  = ' +
            days_between(new Date(compare[year][quarter].eBegins), new Date(compare[year][quarter].iBegins))
        )
        console.log('(All)  qBeginning <> Deadline    = ' +
            days_between(new Date(compare[year][quarter].qBegins), new Date(compare[year][quarter].deadline))
        )
        console.log('(All)  iBeginning <> Deadline    = ' +
            days_between(new Date(compare[year][quarter].iBegins), new Date(compare[year][quarter].deadline))
        )
        console.log('(All)  qBeginning <> iBeginning  = ' +
            days_between(new Date(compare[year][quarter].qBegins), new Date(compare[year][quarter].iBegins))
        )
        console.log('(All)  Days of Instructions      = ' +
            days_between(new Date(compare[year][quarter].iBegins), new Date(compare[year][quarter].iEnds))
        )
        console.log('(All)  qBeginning <> qEnd        = ' +
            days_between(new Date(compare[year][quarter].qBegins), new Date(compare[year][quarter].qEnds))
        )
        console.log('(All)  iEnd       <> qEnd        = ' +
            days_between(new Date(compare[year][quarter].iEnds), new Date(compare[year][quarter].qEnds))
        )
        console.log('(All)  Deadline   <> iEnd        = ' +
            days_between(new Date(compare[year][quarter].deadline), new Date(compare[year][quarter].iEnds))
        )
        console.log('(All)  Deadline   <> qEnd        = ' +
            days_between(new Date(compare[year][quarter].deadline), new Date(compare[year][quarter].qEnds))
        )
        console.log('---')
    }
})
