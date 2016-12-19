
/// <reference path="../../typings/index.d.ts" />

import path = require('path');
import fs = require('fs');
import RxHttp = require('rx-http-ts');
import RxNode = require('rx-node');
import Rx = require('rx');
const env = require('node-env-file');

import {RateGovernor} from "../lib/rateGovornor"

interface IFileStats extends fs.Stats{
    filePath: string;
}

function loadFolderContents(folder: string): Rx.Observable<string[]>{
    const readDirObservable = Rx.Observable.fromNodeCallback<string[]>( fs.readdir )

    return readDirObservable(folder)
        .catch(() => Rx.Observable.empty())
        .map(folderContents => folderContents.map( filepath => path.join(folder, filepath)));
}

function loadPathStat(path: string): Rx.Observable<IFileStats>{
    const statObservable = Rx.Observable.fromNodeCallback<fs.Stats>( fs.stat )

    return statObservable(path)
        .catch(() => Rx.Observable.empty())
        .map(stats => {
            const fileInfo = stats as IFileStats;
            fileInfo.filePath = path;

            return fileInfo;
        })
}

function loadDirectoryTree(folderPath: string): Rx.Observable<string>{
    return loadFolderContents(folderPath)
        .flatMap(contents => {
            return Rx.Observable.from(contents)                
                .flatMap(filePath => loadPathStat(filePath))
                .filter(stats => stats.isDirectory())
                .flatMap(fileInfo => loadDirectoryTree(fileInfo.filePath))
                .merge(Rx.Observable.from(contents));
        });
}

function readFile(filePath: string): Rx.Observable<string>{
    const readFile = Rx.Observable.fromNodeCallback<string>( fs.readFile )

    return readFile(filePath)
        .catch(() => Rx.Observable.empty())
        .map(() => filePath);
}

function logProgress(newLine:boolean = false){
    const elapsed = new Date().getTime() - startTime.getTime();
    var perItem = Math.round(elapsed/loadedCount);

    if(loadedCount === 0){
        perItem = 0;
    }

    var message = `${loadedCount} files loaded in ${elapsed}ms - ${perItem}ms per item (${loadingCount} currently loading)`;

    if(message.length < lastMessageLength){
        (<any>process.stdout).clearLine();  
    }

    if(!newLine){
        message += "\r";
        process.stdout.write(message);
    } else {
        console.log(message);
    }

    lastMessageLength = message.length;
}

var lastMessageLength = 0;
var loadedCount = 0;
var loadingCount = 0;

function markLoadStarted(){
    loadingCount++;
    logProgress();
}

function markLoadFinished(){
    loadingCount--;
    loadedCount++;
    logProgress();
}

var startTime: Date;

console.log("Scanning C:");

var fileList = loadDirectoryTree("c:\\")
    .flatMap(filePath => loadPathStat(filePath))
    .filter(stat => stat.isFile())
    .map(stat => stat.filePath)
    .take(1000)
    .toArray()
    .do(array => {
        startTime = new Date();
        console.log(`${array.length} files ready to load`)
    })
    .flatMap(array => Rx.Observable.from(array))

var governor = new RateGovernor(fileList);

governor.observable
    .do(() => markLoadStarted())
    .flatMap(filePath => readFile(filePath))
    .do(() => markLoadFinished())
    .do(() => governor.governRate())
    .subscribe(
        item => {},
        error => console.log(error),
        () => {
            logProgress(true);
            console.log(`complete`)
        }
    );