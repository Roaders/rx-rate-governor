
import Rx = require('rx');
import {RateGovernor, ITimer} from "../lib/rateGovornor"

describe("Rate Govornor",() => {

    let govornor: RateGovernor<number>;
    let emittedItems: number[];
    let currentTime = 1000;

    let timer: ITimer = {getTime: () => currentTime};

    beforeEach(() => {
        emittedItems = [];
    })

    describe("when items available before subscribe", () => {

        beforeEach(() => {
            const source = Rx.Observable.range(0,80);
            govornor = new RateGovernor(source,timer);
        });

        it("should initally emit one item",() => {
            subscribe();

            assertRate(0,NaN,1,80,1);

            expect(govornor.concurrentCount).toEqual(1);
            expect(emittedItems).toEqual([0]);
        });

        it("should emit one item for the first 10 complete items", () => {
            subscribe();

            for(let completeCount = 0; completeCount <= 9; completeCount++){
                assertRate(completeCount,completeCount === 0 ? NaN : 1000,1,80,completeCount+1);
                expect(emittedItems).toEqual(range(0,completeCount));
                expect(govornor.concurrentCount).toEqual(1);
                completeItems();
            }
        });

        it("when the 10th item is complete concurrent items should increase to 2", () => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            assertRate(10,1000,2,80,10);
            expect(govornor.concurrentCount).toEqual(2);
            expect(emittedItems).toEqual(range(0,11));
        });

        it("if items 10 - 20 complete at a faster rate than items 0 - 10 concurrecy will increase to 3",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                assertRate(completeCount,completeCount>0?1000:NaN,1,80,completeCount);
                completeItems();
            };

            assertRate(10,1000,2,80,10);
            completeItems(2);

            for(let completeCount = 1; completeCount < 10; completeCount++){
                assertRate(completeCount*2,500,2,80,completeCount*2+10);
                completeItems(2);
            };

            assertRate(20,500,3,80,30);

            expect(govornor.concurrentCount).toEqual(3);
            expect(emittedItems).toEqual(range(0,32));
        });


        it("if items 10 - 20 complete at a slower rate than items 0 - 10 concurrecy will reduce to 1",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                assertRate(completeCount,completeCount>0?1000:NaN,1,80,completeCount);
                completeItems();
            };

            assertRate(10,1000,2,80,10);
            completeItems(2,3000);

            for(let completeCount = 1; completeCount < 10; completeCount++){
                assertRate(completeCount*2,1500,2,80,completeCount*2+10);
                completeItems(2, 3000);
            };

            assertRate(20,1500,1,80,30);

            expect(govornor.concurrentCount).toEqual(1);
            expect(emittedItems).toEqual(range(0,30));
        });


        it("if items 10 - 20 complete at the same rate than items 0 - 10 concurrecy will reduce to 1",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                assertRate(completeCount,completeCount>0?1000:NaN,1,80,completeCount);
                completeItems();
            };

            assertRate(10,1000,2,80,10);
            completeItems(2,2000);

            for(let completeCount = 1; completeCount < 10; completeCount++){
                assertRate(completeCount*2,1000,2,80,completeCount*2+10);
                completeItems(2,2000);
            };

            assertRate(20,1000,1,80,30);

            expect(govornor.concurrentCount).toEqual(1);
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

            assertRate(20,1500,1,80,30);
            expect(govornor.concurrentCount).toEqual(1);

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems(1,500);
            };

            assertRate(10,500,1,80,40);
            expect(govornor.concurrentCount).toEqual(1);
        });
    });

    describe("when items not avaiable before subscribe", () =>{

        let source: Rx.Subject<number[]>;

        beforeEach(() => {
            emittedItems = [];
            source = new Rx.Subject<number[]>();
            const numberSource = source.flatMap(itemArray => Rx.Observable.from(itemArray));
            govornor = new RateGovernor(numberSource,timer);
        })

        it("when source emitts items first item immediattely emmitted by govornor", () => {
            subscribe();

            assertRate(0,NaN,0,80,1);
            expect(govornor.concurrentCount).toEqual(1);
            expect(emittedItems).toEqual([]);

            source.onNext(range(0,80));

            assertRate(0,NaN,1,80,1);
            expect(govornor.concurrentCount).toEqual(1);
            expect(emittedItems).toEqual([0]);
        });

        it("when not enough items to complete batch concurrency does not change", () => {
            subscribe();

            source.onNext(range(0,7));

            for(let completeCount = 0; completeCount < 8; completeCount++){
                assertRate(completeCount,completeCount>0?1000:NaN,1,8,completeCount);
                completeItems();
            };

            assertRate(8,1000,0,8,8);

            source.onNext(range(8,15));

            completeItems();

            for(let completeCount = 1; completeCount < 8; completeCount++){
                assertRate(completeCount,completeCount>0?1000:NaN,1,16,completeCount+8);
                completeItems();
            };
                
           assertRate(8,1000,0,16,16);

        });

    });

    function assertRate(count: number, 
        msPerItem: number, 
        inProgress: number, 
        total: number, 
        complete: number){
        expect(govornor.currentRate).toEqual({msPerItem: msPerItem, count: count});
        expect(govornor.inProgress).toEqual(inProgress);
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