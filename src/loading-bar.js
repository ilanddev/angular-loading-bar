/*!
 * angular-loading-bar v0.9.0
 * https://chieffancypants.github.io/angular-loading-bar
 * Copyright (c) 2016 Wes Cruver
 * License: MIT
 */
/*!
 * angular-loading-bar v0.9.0
 * https://chieffancypants.github.io/angular-loading-bar
 * Copyright (c) 2016 Wes Cruver
 * License: MIT
 */
/*!
 * angular-loading-bar v0.9.0
 * https://chieffancypants.github.io/angular-loading-bar
 * Copyright (c) 2016 Wes Cruver
 * License: MIT
 */
/*
 * angular-loading-bar
 *
 * intercepts XHR requests and creates a loading bar.
 * Based on the excellent nprogress work by rstacruz (more info in readme)
 *
 * (c) 2013 Wes Cruver
 * License: MIT
 */

(function() {

  'use strict';

// Alias the loading bar for various backwards compatibilities since the project has matured:
  angular.module('angular-loading-bar', ['cfp.loadingBarInterceptor']);
  angular.module('chieffancypants.loadingBar', ['cfp.loadingBarInterceptor']);

  /**
   * loadingBarInterceptor service
   *
   * Registers itself as an Angular interceptor and listens for XHR requests.
   */
  angular.module('cfp.loadingBarInterceptor', ['cfp.loadingBar'])
    .config(['$httpProvider', function($httpProvider) {

      var interceptor = ['$q', '$cacheFactory', '$timeout', '$rootScope', '$log', 'cfpLoadingBar', function($q, $cacheFactory, $timeout, $rootScope, $log, cfpLoadingBar) {

        /**
         * The total number of requests made
         */
        var reqsTotal = 0;

        /**
         * The number of requests completed (either successfully or not)
         */
        var reqsCompleted = 0;

        /**
         * The amount of time spent fetching before showing the loading bar
         */
        var latencyThreshold = cfpLoadingBar.latencyThreshold;

        /**
         * $timeout handle for latencyThreshold
         */
        var startTimeout;

        /**
         * calls cfpLoadingBar.complete() which removes the
         * loading bar from the DOM.
         */
        function setComplete() {
          $timeout.cancel(startTimeout);
          cfpLoadingBar.complete();
          reqsCompleted = 0;
          reqsTotal = 0;
        }

        /**
         * Determine if the response has already been cached
         * @param  {Object}  config the config option from the request
         * @return {Boolean} retrns true if cached, otherwise false
         */
        function isCached(config) {
          var cache;
          var defaultCache = $cacheFactory.get('$http');
          var defaults = $httpProvider.defaults;

          // Choose the proper cache source. Borrowed from angular: $http service
          if ((config.cache || defaults.cache) && config.cache !== false &&
            (config.method === 'GET' || config.method === 'JSONP')) {
            cache = angular.isObject(config.cache) ? config.cache
              : angular.isObject(defaults.cache) ? defaults.cache
              : defaultCache;
          }

          var cached = cache !== undefined ?
          cache.get(config.url) !== undefined : false;

          if (config.cached !== undefined && cached !== config.cached) {
            return config.cached;
          }
          config.cached = cached;
          return cached;
        }

        /**
         * Handle the request.
         * @param config
         */
        function handleRequest(config) {
          // Check to make sure this request hasn't already been cached and that
          // the requester didn't explicitly ask us to ignore this request:
          if (config && !config.ignoreLoadingBar && !isCached(config) && cfpLoadingBar.isLoaderActivated()) {
            $rootScope.$broadcast('cfpLoadingBar:loading', {url: config.url});
            if (reqsTotal === 0) {
              startTimeout = $timeout(function() {
                cfpLoadingBar.start();
              }, latencyThreshold);
            }
            reqsTotal++;
            cfpLoadingBar.set(reqsCompleted / reqsTotal);
          }
        }

        /**
         * Handle the response or rejection.
         * @param response
         */
        function handleResponse(response) {
          if (!response.config.ignoreLoadingBar && !isCached(response.config) && cfpLoadingBar.isLoaderActivated()) {
            reqsCompleted++;
            $rootScope.$broadcast('cfpLoadingBar:loaded', {url: response.config.url, result: response});
            if (reqsCompleted >= reqsTotal) {
              setComplete();
            } else {
              cfpLoadingBar.set(reqsCompleted / reqsTotal);
            }
          }
        }

        /**
         * Handle the broken interceptor to always keep the loading bar updated.
         * @param place
         */
        function handleBrokenInterceptor(place) {
          if (cfpLoadingBar.isLoaderActivated() && cfpLoadingBar.status() > 0) {
            reqsCompleted++;
            if (reqsCompleted >= reqsTotal) {
              setComplete();
            } else {
              cfpLoadingBar.set(reqsCompleted / reqsTotal);
            }
          }
          $log.error('Broken interceptor detected: Config object not supplied in '+ place +':\n https://github.com/chieffancypants/angular-loading-bar/pull/50');
        }

        return {
          'request': function(config) {
            handleRequest(config);
            return config;
          },

          'response': function(response) {
            if (!response || !response.config) {
              handleBrokenInterceptor('response');
              return response;
            }
            handleResponse(response);
            return response;
          },

          'responseError': function(rejection) {
            if (!rejection || !rejection.config) {
              handleBrokenInterceptor('rejection');
              return $q.reject(rejection);
            }
            handleResponse(rejection);
            return $q.reject(rejection);
          }
        };
      }];

      $httpProvider.interceptors.push(interceptor);
    }]);

  /**
   * Loading Bar
   *
   * This service handles adding and removing the actual element in the DOM.
   * Generally, best practices for DOM manipulation is to take place in a
   * directive, but because the element itself is injected in the DOM only upon
   * XHR requests, and it's likely needed on every view, the best option is to
   * use a service.
   */
  angular.module('cfp.loadingBar', [])
    .provider('cfpLoadingBar', function() {

      this.isActivate = false;
      this.autoIncrement = true;
      this.includeSpinner = true;
      this.includeBar = true;
      this.latencyThreshold = 100;
      this.startSize = 0.02;
      this.parentSelector = 'body';
      this.spinnerTemplate = '<div id="loading-bar-spinner"><div class="spinner-icon"></div></div>';
      this.loadingBarTemplate = '<div id="loading-bar"><div class="bar"><div class="peg"></div></div></div>';

      this.$get = ['$injector', '$document', '$timeout', '$rootScope', function($injector, $document, $timeout, $rootScope) {
        var $animate;
        var $parentSelector = this.parentSelector,
          loadingBarContainer = angular.element(this.loadingBarTemplate),
          loadingBar = loadingBarContainer.find('div').eq(0),
          spinner = angular.element(this.spinnerTemplate);

        var incTimeout,
          completeTimeout,
          started = false,
          status = 0;

        var autoIncrement = this.autoIncrement;
        var includeSpinner = this.includeSpinner;
        var includeBar = this.includeBar;
        var startSize = this.startSize;
        var isActivate = this.isActivate;

        /**
         * Inserts the loading bar element into the dom, and sets it to 2%
         */
        function _start() {

          $timeout.cancel(completeTimeout);

          // do not continually broadcast the started event:
          if (started) {
            return;
          }

          var document = $document[0];
          var parent = document.querySelector ?
            document.querySelector($parentSelector)
            : $document.find($parentSelector)[0];

          if (!parent) {
            parent = document.getElementsByTagName('body')[0];
          }

          var $parent = angular.element(parent);
          var $after = parent.lastChild && angular.element(parent.lastChild);

          $rootScope.$broadcast('cfpLoadingBar:started');
          started = true;

          $animate = _getAnimate();
          if (includeBar) {
            $animate.enter(loadingBarContainer, $parent, $after);
          }

          if (includeSpinner) {
            $animate.enter(spinner, $parent, loadingBarContainer);
          }

          _set(startSize);
        }

        /**
         * Set the loading bar's width to a certain percent.
         *
         * @param n any value between 0 and 1
         */
        function _set(n) {
          if (!started) {
            return;
          }
          if (status < n) {
            var pct = (n * 100) + '%';
            loadingBar.css('width', pct);
            status = n;
          }

          // increment loading-bar to give the illusion that there is always
          // progress but make sure to cancel the previous timeouts so we don't
          // have multiple incs running at the same time.
          if (autoIncrement) {
            $timeout.cancel(incTimeout);
            incTimeout = $timeout(function() {
              _inc();
            }, 250);
          }
        }

        /**
         * Increments the loading bar by a random amount
         * but slows down as it progresses
         */
        function _inc() {
          if (_status() >= 1) {
            var promise = _getAnimate().leave(loadingBarContainer, _completeAnimation);
            if (promise && promise.then) {
              promise.then(_completeAnimation);
            } else {
              _completeAnimation();
            }
            $rootScope.$broadcast('cfpLoadingBar:completed');
            return;
          }

          var rnd = 0;
          var stat = _status();

          function maxIncrement(stat) {
            return (5.5 / -99) * stat + (6.0);
          }

          function incrementer(stat) {
            var m = maxIncrement(stat);
            return (Math.random() * m) / 100;
          }

          if (stat >= 0.99) {
            rnd = 0;
          } else {
            rnd = incrementer(stat);
          }

          var pct = stat + rnd;
          _set(pct);
        }

        function _status() {
          return status;
        }

        function _completeAnimation() {
          status = 0;
          started = false;
          $rootScope.$broadcast('cfpLoadingBar:animation-completed');
          _useLoader(false);
        }

        function _complete() {
          // Clear timeout first then attempt to aggregate any start/complete calls within 500ms:
          $timeout.cancel(completeTimeout);
          completeTimeout = $timeout(function() {
            _set(1);
            _getAnimate().leave(spinner);
          }, 500);
        }

        function _getAnimate() {
          if (!$animate) {
            $animate = $injector.get('$animate');
          }
          return $animate;
        }

        function _isLoaderActivated() {
          return isActivate;
        }

        function _useLoader(bool) {
          if (typeof bool === 'boolean') {
            isActivate = bool;
          }
        }

        function _setParentSelector(selector) {
          if (typeof selector === 'string') {
            isActivate = selector;
          } else {
            return 'Please provide a string as selector.';
          }
        }

        return {
          start: _start,
          set: _set,
          status: _status,
          inc: _inc,
          complete: _complete,
          useLoader: _useLoader,
          setParentSelector: _setParentSelector,
          isLoaderActivated: _isLoaderActivated,
          autoIncrement: this.autoIncrement,
          includeSpinner: this.includeSpinner,
          latencyThreshold: this.latencyThreshold,
          parentSelector: this.parentSelector,
          startSize: this.startSize
        };

      }];   //
    });     // wtf javascript. srsly
})();       //
