# UCSC Courses Fetcher [![build status](https://git.fm/zllovesuki/ucsc/badges/master/build.svg)](https://git.fm/zllovesuki/ucsc/commits/master)

This repo contains:

1. Workers to fetch the newest terms automatically (incrementally) or freshly (initialization). This requires `pm2` installed
2. Helper functions to help with fetching courses data, maps, GE, ratemyprofessors, statistics, etc. You can use this repo as a module directly in other projects

You will need to have a S3 account somewhere:
(`config.json`)
```json
{
    "s3": {
        "endpoint": "AWS or on-premise endpoints",
        "key": "",
        "secret": "",
        "bucket": ""
    }
}
```

The build indicator signifies the validaity of the DOM parser. All data are fetched from [pisa.ucsc.edu](pisa.ucsc.edu), which outputs some data in a Base64 encoded string of PHP's serialized array, or DOM. The job of the script is to either A) parse the base64 data, or B) interpret the DOM directly with `cheerio`, or from UCSC websites, or from RateMyProfessors.com *If the build fails*, that means pisa.ucsc.edu's page structure is probably changed, or other sources. Please notify me or your can submit a pull request to fix it.

### Data Structure

List of Terms (`db/terms.json`):
```json
[
  {
    "code": "2168",
    "name": "2016 Fall Quarter"
  },
  {
    "code": "2164",
    "name": "2016 Summer Quarter"
  },
  ...
]
```

List of courses (`db/terms/2168.json`):
```json
{
	"AMS": [
	{
		"c": "5", // class code
		"s": "01", // class section
		"n": "Statistics", // class name
		"num": "21304", // class number
		"loct": [
            {
                "t": {
        			"day": [
        				"Tuesday",
        				"Thursday"
        			],
        			"time": {
        				"start": "09:50",
        				"end": "11:25"
        			},
                },
                "loc": "J Bask Aud 101"
            }
        ],
		"cap": "200", // capacity
		"ins": { // instructor object
			"d": [
				"Mendes,B.S." // display name(s)
			],
			"f": "Bruno", // first name
			"l": "Mendes", // last name
			"m": "Silva" // middle name
		},
	},
	...
	],
	"ANTH": [
	{
		"c": "1",
		"s": "01",
		"n": "Intro Biolog Anth",
		"num": "20581",
        "loct": [
            {
                "t": {
        			"day": [
        				"Monday",
        				"Wednesday"
        			],
        			"time": {
        				"start": "17:20",
        				"end": "18:55"
        			}
        		},
        		"loc": "Media Theater M110"
            }
        ],
		"cap": "255",
		"ins": {
			"d": [
				"Reti,J."
			],
			"f": "Joseph",
			"l": "Reti",
			"m": null
		}
	},
	...
	]
}
```

Course Information (`db/courses/2168.json`):
```json
{
	"20503": {
		"ty": "Studio", // type of class
		"cr": "0", // number of credits
		"ge": [], // GE cat
		"re": null, // requirements
		"com": [], // combined sections
		"sec": [] // sections
	},
	...
	"20581": {
		"ty": "Lecture",
		"cr": "5",
		"ge": [
			"SI",
			"IN"
		],
		"re": null,
		"com": [],
		"sec": [{
			"num": "20582", // class number
			"sec": "01A", // class section
            "loct": [
                {
                    "t": { // time object
        				"day": [
        					"Monday"
        				],
        				"time": {
        					"start": "08:00",
        					"end": "09:10"
        				}
        			},
                    "loc": "Soc Sci 1 317" // location
                }
            ],
			"ins": "Staff", // TA
			"cap": "15" // capacity
		},
		...
		]
	},
	...
}
```

GE codes and descriptions (`./db/ge.json`):
```json
{
	"CC": "Cross-Cultural Analysis",
	"ER": "Ethnicity and race",
	"IM": "Interpreting Arts and Media",
	"MF": "Mathematical and Formal Reasoning",
	"SI": "Scientific Inquiry",
	"SR": "Statistical Reasoning",
	"TA": "Textual Analysis",
	"PE-E": "Environmental Awareness",
	"PE-H": "Human Behavior",
	"PE-T": "Technology and Society",
	"PR-E": "Collaborative Endeavor",
	"PR-C": "Creative Process",
	"PR-S": "Service Learning",
	"C2": "Composition",
	"C1": "Composition",
	"DC": "Disciplinary Communication"
}
```

RMP simple scores (`./db/rmp/scores/110723.json`):
```json
{
	"overall": "2.5",
	"again": "N/A",
	"difficulty": "2.8",
	"tags": [{
		"tag": "extra credit offered",
		"count": "1"
	}, {
		"tag": "hilarious",
		"count": "1"
	}, {
		"tag": "lecture heavy",
		"count": "1"
	}, {
		"tag": "participation matters",
		"count": "1"
	}, {
		"tag": "clear grading criteria",
		"count": "1"
	}, {
		"tag": "beware of pop quizzes",
		"count": "1"
	}],
	"count": "134"
}
```

RMP all ratings (`db/rmp/ratings/942860.json`):
```json
[{
	"attendance": "N/A",
	"clarityColor": "poor",
	"easyColor": "poor",
	"helpColor": "poor",
	"helpCount": 0,
	"id": 12705679,
	"notHelpCount": 0,
	"onlineClass": "",
	"quality": "poor",
	"rClarity": 1,
	"rClass": "CORE80A",
	"rComments": "She is very unorganized and unprofessional. She has good intenstions but should not be a teacher. She has an irritating habbit of talking with her eyes closed and saying um a million times.",
	"rDate": "01/01/2007",
	"rEasy": 1,
	"rEasyString": "1.0",
	"rErrorMsg": null,
	"rHelpful": 2,
	"rInterest": "Sorta interested",
	"rOverall": 1.5,
	"rOverallString": "1.5",
	"rStatus": 3,
	"rTextBookUse": "No",
	"rWouldTakeAgain": "N/A",
	"sId": 1078,
	"takenForCredit": "N/A",
	"teacher": null,
	"teacherGrade": "N/A",
	"teacherRatingTags": [],
	"unUsefulGrouping": "people",
	"usefulGrouping": "people"
}]
```

RMP simple stats (`db/rmp/stats/160090.json`)
```json
{
	"clarity": 2.686905417814509,
	"easy": 3.923976124885216,
	"overall": 2.6671487603305786,
	"quality": {
		"awesome": 131,
		"average": 101,
		"poor": 115,
		"good": 125,
		"awful": 193
	}
}
```
