
import Rx = require('rx');
import {StreamCounter, IStreamCounterInfo, IRate, ITimer} from "stream-item-timer"

interface IPerformanceMeasure{
    totalItems: number;
    counter: StreamCounter;
}

export interface IRateGovernorInfo extends IStreamCounterInfo{
    readonly concurrentCount: number;
}

export class RateGovernor<T> implements IRateGovernorInfo{

    //  Constructor

    constructor(observable: Rx.Observable<T>, 
        private _progressCallback?: () => void, 
        private _timer?: ITimer){

        this._controlled = observable
            .do(() => this.handleItemFromSource())
            .controlled();

        this._notStartedCounter = new StreamCounter(_progressCallback);
        this._completeCounter = new StreamCounter(_progressCallback);

        this._downstreamObservable = this._controlled.do(() => this.handleRequestedItemReceived())
    }

    //  Private Variables

    private _notStartedCounter: StreamCounter;
    private _completeCounter: StreamCounter;

    private _controlled: Rx.ControlledObservable<T>;
    private _downstreamObservable: Rx.Observable<T>;

    private _increasingCount: boolean = true;

    private _incompleteMeasure: IPerformanceMeasure | null;
    private _lastMeasure: IPerformanceMeasure | null;
    private _currentMeasure: IPerformanceMeasure | null;

    //  Properties

    get rate(): IRate{
        let measure = this._measure ? this._measure : this._incompleteMeasure
        return measure ? measure.counter.rate : {count: 0, msPerItem: NaN};
    }

    get inProgress(): number{
        return this._currentMeasure ? this._currentMeasure.counter.inProgress : 0;
    }

    get total(): number{
        return this._completeCounter.total
    }

    get complete(): number{
        return this._completeCounter.complete;
    }

    private _concurrentCount = 1;

    public get concurrentCount(){
        return this._concurrentCount;
    }

    public get observable(): Rx.Observable<T>{
        return this._downstreamObservable;
    }

    //  Public Functions

    public governRate(){
        if(!this._currentMeasure){
            throw new Error(`No current measure defined`);
        }

        this._currentMeasure.counter.itemComplete();
        this._completeCounter.itemComplete();

       //console.log(`Govorn: ${this._currentMeasure.counter.inProgress} in progress, ${this._concurrentCount} concurrent, ${this._notStartedCounter.inProgress} queued`)

       this.request();
    }

    //  Private Functions

    private get _measure(): IPerformanceMeasure | null {
        if(this._currentMeasure && this._currentMeasure.counter.rate.count > 0){
            return this._currentMeasure;
        }
        
        return this._lastMeasure;
    }

    private handleItemFromSource(){
        this._notStartedCounter.newItem();
        this._completeCounter.newItem();

        this.request();
    }

    private handleRequestedItemReceived(){
        if(!this._currentMeasure){
            console.error("RateGovernor: Requested item received but no currentMeasure");
            throw new Error("RateGovernor: Requested item received but no currentMeasure");
        }
        this._notStartedCounter.itemComplete();
        this._currentMeasure.counter.newItem();
        //console.log(`requested item received. InProgress: ${this._currentMeasure.counter.inProgress}`)
    }

    private request(){
        if(!this._currentMeasure){
            this.beginMeasureBatch();
        }

        const inProgress = this._currentMeasure!.counter.inProgress;
        //work out how many items to request to maintain our number of concurrent items
        const batchRemainingItems = this._currentMeasure!.totalItems - this._currentMeasure!.counter.complete;
        const requestCount = Math.min(this._concurrentCount - inProgress, batchRemainingItems - inProgress, this._notStartedCounter.inProgress);

        if(requestCount > 0){
            //console.log(`Requesting ${requestCount}`);
            this._controlled.request(requestCount);
        } else if(batchRemainingItems === 0 || this._currentMeasure!.counter.inProgress === 0){
            //finished this batch of items, finalise measurements
            this.completeMeasureBatch();

            if(this._notStartedCounter.inProgress > 0){
                //console.log(`Requesting new concurrent count: ${requestCount} (not started: ${this._notStartedCounter.inProgress})`);
                this.beginMeasureBatch();
                this._controlled.request(this._concurrentCount);
            }
        }
    }

    private completeMeasureBatch(){
        if(this._currentMeasure && this._currentMeasure.counter.complete >= this._currentMeasure.totalItems && this._currentMeasure.counter.inProgress === 0){

            //console.log("##################################################################################################");
            //console.log(`Batch complete: ${this._currentMeasure.counter.complete}/${this._currentMeasure.counter.total} (progress: ${this._currentMeasure.counter.inProgress}) (${this._currentMeasure.counter.rate.msPerItem}ms/item) ${this._concurrentCount} concurrent`);

            const lastRate = this._lastMeasure ? this._lastMeasure.counter.rate : null;
            const currentRate = this._currentMeasure.counter.rate;

            //if this batch was slower reverse our direction
            if(lastRate && (
                (this._increasingCount && lastRate.msPerItem <= currentRate.msPerItem) || (!this._increasingCount && lastRate.msPerItem < currentRate.msPerItem)
            )){
                this._increasingCount = !this._increasingCount;
                //console.log(`swapping direction. increasing: ${this._increasingCount}`);
            }

            //update number of concurrent items
            this._concurrentCount = this._increasingCount ? this._concurrentCount+1 : this._concurrentCount-1;
            this._concurrentCount = Math.max(1,this._concurrentCount);

            //console.log(`new concurrent count: ${this._concurrentCount}`);

            //clear values for next batch
            this._lastMeasure = this._currentMeasure;
            this._incompleteMeasure = null;
        } else {
            //console.log(`incomplete batch, saving incompleteMeasure: ${this._currentMeasure} complete: ${this._currentMeasure!.counter.complete} total: ${this._currentMeasure!.totalItems} inProgress: ${this._currentMeasure!.counter.inProgress}`)
            this._incompleteMeasure = this._currentMeasure;
            this._lastMeasure = null;
        }

        this._currentMeasure = null;
    }

    private beginMeasureBatch(){
        //console.log(`new batch: ${this._concurrentCount}`);
        this._currentMeasure = {
            totalItems: this._concurrentCount*10,
            counter: new StreamCounter(this._progressCallback,this._timer)
        };
    }
}