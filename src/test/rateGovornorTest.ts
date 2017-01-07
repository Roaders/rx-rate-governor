
import Rx = require('rx');
import {RateGovernor} from "../lib/rateGovornor"
import {IStreamCounterInfo,IRate,ITimer} from "stream-item-timer";

describe("Rate Govornor",() => {

    let govornor: RateGovernor<number>;
    let emittedItems: number[];
    let currentTime = 1000;

    let timer: ITimer = {getTime: (): number => currentTime};

    beforeEach(() => {
        emittedItems = [];
    })

    describe("when items available before subscribe", () => {

        beforeEach(() => {
            const source = Rx.Observable.range(0,80);
            govornor = new RateGovernor(source,undefined,timer);
        });

        it("should initally emit one item",() => {
            subscribe();

            assertState({rate:{count: 0, msPerItem: NaN}, inProgress: 1, total: 80, complete: 0},1);
            expect(emittedItems).toEqual([0]);
        });

        it("should emit one item for the first 10 complete items", () => {
            subscribe();

            for(let completeCount = 0; completeCount <= 9; completeCount++){
                assertState({rate:{count: completeCount, msPerItem: 1000}, inProgress: 1, total: 80, complete: completeCount+1},1);
                expect(emittedItems).toEqual(range(0,completeCount));
                completeItems();
            }
        });

        it("when the 10th item is complete concurrent items should increase to 2", () => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            assertState({rate:{count: 10, msPerItem: 1000}, inProgress: 2, total: 80, complete: 10},2);
            expect(emittedItems).toEqual(range(0,11));
        });

        it("if items 10 - 20 complete at a faster rate than items 0 - 10 concurrecy will increase to 3",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                assertState({rate:{count: completeCount, msPerItem: 1000}, inProgress: 1, total: 80, complete: completeCount+1},1);
                completeItems();
            };

            assertState({rate:{count: 10, msPerItem: 1000}, inProgress: 2, total: 80, complete: 10},2);
            completeItems(2);

            for(let completeCount = 1; completeCount < 10; completeCount++){
                assertState({rate:{count: completeCount*2, msPerItem: 500}, inProgress: 2, total: 80, complete: completeCount*2+10},2);
                completeItems(2);
            };

            assertState({rate:{count: 20, msPerItem: 500}, inProgress: 3, total: 80, complete: 30},3);
            expect(emittedItems).toEqual(range(0,32));
        });


        it("if items 10 - 20 complete at a slower rate than items 0 - 10 concurrecy will reduce to 1",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                assertState({rate:{count: completeCount, msPerItem: 1000}, inProgress: 1, total: 80, complete: completeCount+1},1);
                completeItems();
            };

            assertState({rate:{count: 10, msPerItem: 1000}, inProgress: 2, total: 80, complete: 10},2);
            completeItems(2,3000);

            for(let completeCount = 1; completeCount < 10; completeCount++){
                assertState({rate:{count: completeCount*2, msPerItem: 1500}, inProgress: 2, total: 80, complete: completeCount*2+10},2);
                completeItems(2, 3000);
            };

            assertState({rate:{count: 20, msPerItem: 1500}, inProgress: 1, total: 80, complete: 30},1);
            expect(emittedItems).toEqual(range(0,30));
        });


        it("if items 10 - 20 complete at the same rate than items 0 - 10 concurrecy will reduce to 1",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                assertState({rate:{count: completeCount, msPerItem: 1000}, inProgress: 1, total: 80, complete: completeCount+1},1);
                completeItems();
            };

            assertState({rate:{count: 10, msPerItem: 1000}, inProgress: 2, total: 80, complete: 10},2);
            completeItems(2,2000);

            for(let completeCount = 1; completeCount < 10; completeCount++){
                assertState({rate:{count: completeCount*2, msPerItem: 1000}, inProgress: 2, total: 80, complete: completeCount*2+10},2);
                completeItems(2,2000);
            };

            assertState({rate:{count: 20, msPerItem: 1000}, inProgress: 1, total: 80, complete: 30},1);
            expect(emittedItems).toEqual(range(0,30));
        });

        it("if small batches are faster concurrent count does not drop below 0", () => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems(2, 3000);
            };

            assertState({rate:{count: 20, msPerItem: 1500}, inProgress: 1, total: 80, complete: 30},1);

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems(1,500);
            };

            assertState({rate:{count: 10, msPerItem: 500}, inProgress: 1, total: 80, complete: 40},1);
        });
    });

    describe("when items not avaiable before subscribe", () =>{

        let source: Rx.Subject<number[]>;

        beforeEach(() => {
            emittedItems = [];
            source = new Rx.Subject<number[]>();
            const numberSource = source.flatMap(itemArray => Rx.Observable.from(itemArray));
            govornor = new RateGovernor(numberSource,undefined,timer);
        })

        it("when source emits items first item immediattely emmitted by govornor", () => {
            subscribe();

            assertState({rate:{count: 0, msPerItem: NaN}, inProgress: 0, total: 80, complete: 0},1);
            expect(emittedItems).toEqual([]);

            source.onNext(range(0,80));

            assertState({rate:{count: 0, msPerItem: NaN}, inProgress: 1, total: 80, complete: 1},1);
            expect(emittedItems).toEqual([0]);
        });

        it("when not enough items to complete batch concurrency does not change", () => {
            subscribe();

            source.onNext(range(0,7));

            for(let completeCount = 0; completeCount < 8; completeCount++){
                assertState({rate:{count: completeCount, msPerItem: 1000}, inProgress: 1, total: 8, complete: completeCount},1);
                completeItems();
            };

            assertState({rate:{count: 8, msPerItem: 1000}, inProgress: 0, total: 8, complete: 8},1);

            source.onNext(range(8,15));

            completeItems();

            for(let completeCount = 1; completeCount < 8; completeCount++){
                assertState({rate:{count: completeCount, msPerItem: 1000}, inProgress: 1, total: 16, complete: completeCount+8},1);
                completeItems();
            };

            assertState({rate:{count: 8, msPerItem: 1000}, inProgress: 0, total: 16, complete: 16},1);

        });

    });

    function assertState(state: IStreamCounterInfo, concurrentCount: number){
        const expectedRate: IRate = {
            count: state.rate.count, 
            msPerItem: state.rate.count === 0 ? NaN : state.rate.msPerItem
        };

        expect(govornor.rate).toEqual(expectedRate);
        expect(govornor.inProgress).toEqual(state.inProgress);
        expect(govornor.concurrentCount).toEqual(concurrentCount);
    }

    function range(start: number, end: number): number[]{
        const range: number[] = [];

        for(let current = start; current <= end; current++){
            range.push(current);
        }

        return range;
    }

    function completeItems(count = 1, elapsed: number = 1000){
        advanceTime(elapsed);

        for(let index = 0; index < count; index++){
            govornor.governRate();
        }
    }

    function advanceTime(elapsed: number = 1000){
        currentTime += elapsed;
    }

    function subscribe(){
        govornor.observable.subscribe(
            item => {
                //console.log(`${item } received`);
                emittedItems.push(item)
            }
        );
    }

})