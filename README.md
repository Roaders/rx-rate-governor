[![Build Status](https://travis-ci.org/Roaders/rx-rate-governor.svg?branch=master)](https://travis-ci.org/Roaders/rx-rate-governor)
[![Known Vulnerabilities](https://snyk.io/test/github/roaders/rx-rate-governor/badge.svg)](https://snyk.io/test/github/roaders/rx-rate-governor)


# rx-rate-governor
Library to help find optimal concurrent items for parallel tasks

This library attempts to help find the optimal rate in which to perform concurrent tasks.

It does this by starting with a concurrency of 1 and increasing it whilst measuring the rate. When the rate starts to decrease it will then start to lower the concurrency again until the rate starts to decrease and it will then start to increase it again and so on.

An example might be:

- loaded 10 items with a concurrency of 1 at 50ms per item
- loaded 20 items with a concurrency of 2 at 40ms per item
- loaded 30 items with a concurrency of 3 at 35ms per item
- loaded 40 items with a concurrency of 4 at 34ms per item
- loaded 50 items with a concurrency of 5 at 37ms per item
- loaded 40 items with a concurrency of 4 at 30ms per item
- loaded 30 items with a concurrency of 3 at 35ms per item
- loaded 40 items with a concurrency of 4 at 30ms per item

...and so on

## Usage

In an example where you might do this:

```
Rx.Observable.from(listOfItemsToLoad)
	.flatMap(itemToLoad => loadItem(itemToLoad))
	.merge(2)
	.subscribe();
```

This would load 2 items concurrently.

With `rx-rate-governor` you would do this:

```
import {RateGovernor} from "rx-rate-governor";

var itemSource = Rx.Observable.from(listOfItemsToLoad);

var governor = new RateGovernor(itemSource);

governor.controlledStream
	.flatMap(itemToLoad => loadItem(itemToLoad))
	.do(() => governor.governRate())
	.subscribe();

```

Examples of usage can be found in `src/examples/testHttp.ts` and `src/examples/testReadFile`.
