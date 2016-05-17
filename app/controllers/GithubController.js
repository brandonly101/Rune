var Helper = require('../models/helpers.js');

var request = require('request');

module.exports = function(app, passport) {

    app.get('/auth/github/', Helper.isLoggedIn, passport.authenticate('github'));

    app.get('/auth/github/callback/', Helper.isLoggedIn, passport.authenticate('github', {
        failureRedirect: '/github_fail',
        successRedirect: '/github_success',
        failureFlash : true
    }));

    app.get('/github_fail', function(req,res) {
        res.render('github.jade', {
            message1: 'fail',
            message2: req.flash('githubMessage')
        })
    })
    app.get('/github_success', function(req,res) {
        res.render('github.jade', {
            message1: 'success',
            message2: req.flash('githubMessage')
        })
    })

    app.get('/github_project', function(req,res) {
        res.render('github.jade');
    });
    app.post('/github_project', function(req,res) {

        var options = {
            url : 'https://api.github.com/repos/' + req.body.repo_owner + '/' + req.body.repo_name + '/commits?client_id=fb79527a871e5ba8f0f7&client_secret=a82aa7f700c3f1022aefa81abdf77cf590593098',
            headers : {
                'User-Agent': 'request'
            }
        }
        request(options, function(err,response,body){
            if (response.statusCode != 200) {
                console.log('something weird happened.');
                res.render('github.jade', {
                    errorMessage : '-_-'
                })


            } else {
                var commitList = JSON.parse(body);
                res.render('github.jade', {
                    url : 'https:/github.com/'+ req.body.repo_owner + '/' + req.body.repo_name + '/commit/' ,
                    results : commitList
                })
            }

        });

    });
};