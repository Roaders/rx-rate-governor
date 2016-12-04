
import Rx = require('rx');

interface IPerformanceMeasure{
    itemCount: number;
    totalItems: number;
    concurrentCount: number;
    msPerItem?: number;
}

export class RateGovernor<T>{

    constructor(observable: Rx.Observable<T>){
        this._controlled = observable
            .do(() => this.handleItemFromSource())
            .controlled();

        this._downstreamObservable = this._controlled.do(() => this.handleRequestedItemReceived())
    }

    private _firstItemRecieved: boolean;
    private _controlled: Rx.ControlledObservable<T>;
    private _downstreamObservable: Rx.Observable<T>;

    private _queuedItems = 0;
    private _inProgress = 0;
    private _increasingCount: boolean = true;

    private _lastMeasure: IPerformanceMeasure;
    private _currentMeasure: IPerformanceMeasure;
    private _measureStart: Date;

    private _concurrentCount = 1;

    public get concurrentCount(){
        return this._concurrentCount;
    }

    public get observable(): Rx.Observable<T>{
        return this._downstreamObservable;
    }

    public governRate(){
        this._inProgress--
        this._currentMeasure.itemCount++;

        //work out how many items to request to maintain our number of concurrent items
        const batchRemainingItems = this._currentMeasure.totalItems - this._currentMeasure.itemCount;
        const requestCount = Math.min(this._concurrentCount - this._inProgress, batchRemainingItems, this._queuedItems);

       //console.log(`${this._inProgress} in progress, ${this._concurrentCount} concurrent, ${requestCount} requested, ${this._queuedItems} queued`)

        if(requestCount > 0){
            this.request(requestCount);
        } else if(batchRemainingItems === 0 || this._queuedItems === 0){
            //finished this batch of items, finalise measurements
            this.completeMeasureBatch();
            this.request(this._concurrentCount);
        }
    }

    private handleItemFromSource(){
        if(!this._firstItemRecieved){
            this._firstItemRecieved = true;
            this.request(this._concurrentCount);
        }

        this._queuedItems++;
    }

    private handleRequestedItemReceived(){
        //console.log(`requested item received`)
        this._inProgress++;
        this._queuedItems--;
    }

    private request(count: number){
        if(!this._currentMeasure){
            this.beginMeasureBatch();
        }

        //console.log(`Requesting ${count}`)

        this._controlled.request(count);
    }

    private completeMeasureBatch(){
        if(this._currentMeasure.itemCount === this._currentMeasure.totalItems){
            const elapsed = new Date().getTime() - this._measureStart.getTime();
            this._currentMeasure.msPerItem = Math.round(elapsed/this._currentMeasure.itemCount);

            //console.log(`Batch complete: ${this._currentMeasure.itemCount} in ${elapsed}ms (${this._currentMeasure.msPerItem}ms/item) ${this._concurrentCount} concurrent`);

            //if this batch was slower reverse our direction
            if(this._lastMeasure && this._lastMeasure.msPerItem <= this._currentMeasure.msPerItem){
                this._increasingCount = !this._increasingCount;
                //console.log(`swapping direction. increasing: ${this._increasingCount}`);
            }

            //update number of concurrent items
            this._concurrentCount = this._increasingCount ? this._concurrentCount+1 : this._concurrentCount-1;
            this._concurrentCount = Math.max(1,this._concurrentCount);

            //console.log(`new concurrent count: ${this._concurrentCount}`);

            //clear values for next batch
            this._lastMeasure = this._currentMeasure;
        } else {
            //console.log(`incomplete batch, not saving`)
        }

        this._currentMeasure = null;
        this._measureStart = null;
    }

    private beginMeasureBatch(){
        //console.log("new batch");
        this._currentMeasure = {
            itemCount: 0,
            totalItems: this._concurrentCount*10,
            concurrentCount: this._concurrentCount
        };
        this._measureStart = new Date();
    }


}