
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

    describe("when source is cold", () => {

        beforeEach(() => {
            const source = Rx.Observable.range(0,80);
            govornor = new RateGovernor(source,timer);
        });

        it("should initally emit one item",() => {
            subscribe();

            expect(govornor.concurrentCount).toEqual(1);
            expect(govornor.inProgress).toEqual(1);
            expect(emittedItems).toEqual([0]);
        });

        it("should emit one item for the first 10 complete items", () => {
            subscribe();

            for(let completeCount = 0; completeCount <= 9; completeCount++){
                expect(emittedItems).toEqual(range(0,completeCount));
                expect(govornor.inProgress).toEqual(1);
                expect(govornor.concurrentCount).toEqual(1);
                completeItems();
            }
        });

        it("when the 10th item is complete concurrent items should increase to 2", () => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            expect(govornor.inProgress).toEqual(2);
            expect(govornor.concurrentCount).toEqual(2);
            expect(emittedItems).toEqual(range(0,11));
        });

        it("if items 10 - 20 complete at a faster rate than items 0 - 10 concurrecy will increase to 3",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems(2);
            };

            expect(govornor.inProgress).toEqual(3);
            expect(govornor.concurrentCount).toEqual(3);
            expect(emittedItems).toEqual(range(0,32));
        });


        it("if items 10 - 20 complete at a slower rate than items 0 - 10 concurrecy will reduce to 1",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems(2, 3000);
            };

            expect(govornor.inProgress).toEqual(1);
            expect(govornor.concurrentCount).toEqual(1);
            expect(emittedItems).toEqual(range(0,30));
        });


        it("if items 10 - 20 complete at the same rate than items 0 - 10 concurrecy will reduce to 1",() => {
            subscribe();

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems();
            };

            for(let completeCount = 0; completeCount < 10; completeCount++){
                completeItems(2,2000);
            };

            expect(govornor.inProgress).toEqual(1);
            expect(govornor.concurrentCount).toEqual(1);
            expect(emittedItems).toEqual(range(0,30));
        });
    });

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