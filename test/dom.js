var ucsc = require('../index');

var chai = require('chai');
var expect = chai.expect;
chai.should();
chai.use(require('chai-things'));

describe('Terms List DOM Parser', function() {
    it('Should obtains a list of quarters', function(done) {
        ucsc.getTerms().then(function(terms) {
            try {
                terms.should.include({"code":"2168","name":"2016 Fall Quarter"});
                done();
            }catch(e) {
                done(e);
            }
        })
    })
})

describe('Courses List DOM Parser', function() {
    it('Should obtains a list of courses', function(done) {
        ucsc.getCourses(2168, 1).then(function(courses) {
            try {
                expect(courses).to.have.property('AMS')
                done();
            }catch(e) {
                done(e);
            }
        })
    })
})

describe('Course Information DOM Parser', function() {
    it('Should obtains course details', function(done) {
        ucsc.getCourse(2168, 21146).then(function(course) {
            try {
                expect(course).to.have.property('cr');
                expect(course.cr).to.eql('5');
                expect(course).to.have.property('sec');
                expect(course.sec.length).to.be.eql(6);
                expect(course).to.have.property('com');
                expect(course.com.length).to.be.eql(2);
                expect(course).to.have.property('re');
                expect(course.re).to.eql('course 11A , Economics 11A, Mathematics 11A, or Mathematics 19A.');
                done();
            }catch(e) {
                done(e);
            }
        })
    })
})

describe('GE Description DOM Parser', function() {
    it('Should obtains a list of GE codes and descriptions', function(done) {
        ucsc.getGEDesc().then(function(ge) {
            try {
                expect(ge).to.have.property('CC');
                done();
            }catch(e) {
                done(e);
            }
        })
    })
})

describe('Map Coordinates DOM Parser', function() {
    it('Should obtains a list of locations', function(done) {
        ucsc.getMaps().then(function(locations) {
            try {
                expect(locations).to.have.property('classrooms');
                expect(locations.classrooms.length).to.be.eql(98);
                done();
            }catch(e) {
                done(e);
            }
        })
    })
})

describe('RateMyProfessors Stats DOM Parser', function() {
    it('Should obtains Yonatan Katznelson\'s RMP stats', function(done) {
        ucsc.getObjByFullName('Yonatan', 'Katznelson').then(function(list) {
            expect(list.length).to.be.above(0);
            return ucsc.getRateMyProfessorScoresByTid(list[0].tid).then(function(rmp) {
                try {
                    // Sorry professor, but you are very spicy
                    expect(rmp).to.have.property('scores');
                    expect(rmp.scores).to.have.property('overall');
                    expect(rmp.scores.overall).to.be.below(3);
                    expect(rmp.scores).to.have.property('count');
                    expect(rmp.scores.count).to.be.above(300);
                    done();
                }catch(e) {
                    done(e);
                }
            })
        })
    })
})

describe('Major/Minors PDF Parser', function() {
    it('Should obtains a list of majors and minors', function(done) {
        ucsc.getMajorMinor().then(function(list) {
            try {
                expect(list).to.have.property('majors');
                expect(list).to.have.property('minors');
                list.majors.should.include({'Computer Science': ['BA', 'BS']})
                list.minors.should.include('Mathematics')
                done();
            }catch(e) {
                done(e);
            }
        })
    })
})
