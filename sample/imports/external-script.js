Polymer({
is: 'observer-not-function-external',
properties: {
  /*
   * This function's observer is a string. Don't do that!
   */
  brokenObserver: {
    type: String,
    value: 'bikeshed',
    observer: '_brokenObserverChanged'
  },
  /*
   * This function's observer doesn't even exist!
   */
  brokenObserver2: {
    type: String,
    value: 'bikeshed',
    observer: '_brokenObserver2Changed'
  }
},
observers: [
  '_computeValue(brokenObserver)'
],
_brokenObserverChanged: 'I am not a function',

_computeValue: 42
})