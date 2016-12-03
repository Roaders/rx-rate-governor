
/// <reference path="../../typings/index.d.ts" />

import path = require('path');
import fs = require('fs');
import RxHttp = require('rx-http-ts');
import Rx = require('rx');
const env = require('node-env-file');

const environmentFile = path.join(__dirname,'../environmentVariables.properties' );

console.log(`Checking for environment file at ${environmentFile}`)

if (fs.existsSync(environmentFile)) {
	console.log(`Loading environment file`);
	env(environmentFile)
}

const categoriesUrl = `https://www.googleapis.com/youtube/v3/guideCategories?part=id&regionCode=GB&key=${process.env.API_KEY}`
const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=id&categoryId=`
const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&maxResults=50&channelId=`
const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=id&id=`;

function loadChannelsForCategory(categoryId: string){
    return Rx.Observable.defer(() => {
        const url = channelsUrl + categoryId + "&key=" + process.env.API_KEY;
        //console.log(`loading channels: ${url}`);

        return RxHttp.getJson<any>(url,true);
    })
}

function loadVideosForChannel(channelId: string){
    return Rx.Observable.defer(() => {
        const url = searchUrl + channelId + "&key=" + process.env.API_KEY;
        //console.log(`searching for videos: ${url}`);

        return RxHttp.getJson<any>(url,true);
    })
}

function loadVideoDetails(videoId: string){
    return Rx.Observable.defer(() => {
        const url = videoDetailsUrl + videoId + "&key=" + process.env.API_KEY;
        //console.log(`loading video: ${url}`);

        return RxHttp.getJson<any>(url,true);
    })
}

function logProgress(newLine:boolean = false){
    const elapsed = new Date().getTime() - startTime.getTime();
    const perItem = Math.round(elapsed/loadedCount);

    var message = `${loadedCount} videos loaded in ${elapsed}ms - ${perItem}ms per item`

    if(!newLine){
        message += "\r";
        process.stdout.write(message);
    } else {
        console.log(message);
    }

}

var startTime: Date;

console.log(`Loading video list...`);

var loadVideoArray = RxHttp.getJson<any>(categoriesUrl,true)
    .flatMap(categoriesResponse => Rx.Observable.from<any>(categoriesResponse.items))
    .map<string>(category => category.id)
    .map(categoryId => loadChannelsForCategory(categoryId))
    .merge(5)
    .flatMap(categoriesResponse => Rx.Observable.from<any>(categoriesResponse.items))
    .map<string>(channel => channel.id)
    .map(channelId => loadVideosForChannel(channelId))
    .merge(5)
    .flatMap(searchResponse => Rx.Observable.from<any>(searchResponse.items))
    .map<string>(video => video.id.videoId)
    .filter(videoId => videoId != null)
    .take(500)
    .toArray()
    .do(array => {
        startTime = new Date();
        console.log(`${array.length} videos ready to load`)
    });

var loadedCount = 0;

loadVideoArray
    .flatMap(videoArray => Rx.Observable.from(videoArray))
    .map(categoryId => loadVideoDetails(categoryId))
    .merge(10)
    .do(() => loadedCount++)
    .do(() => logProgress())
    .subscribe(
        result => {},
        error => {},
        () => {
            logProgress(true);
            console.log(`complete`)
        }
    );