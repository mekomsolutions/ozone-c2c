var showOrHideAdditionalInfoSection = function (patient) {
    var returnValues = {
        show: [],
        hide: []
    };

    return returnValues
};

Bahmni.Registration.AttributesConditions.rules = {
    'age': function (patient) {
        return showOrHideAdditionalInfoSection(patient);
    }
};

// Location filter on the registration patient search, enabled by "patientSearch.locationFilter" in app.json.
// bahmni-web has no config hook for extra search fields, so it is patched in from here: this file is loaded by
// registration/index.html after the app bundles and before Angular bootstraps.
(function () {
    var searchTemplateUrl = /(^|\/)views\/search\.html$/;
    var searchButton = /<article class="fl">\s*<div class="reg-srch-btn">/;
    var filterMarkup = '<article class="fl" registration-location-filter></article>';

    angular.module('registration')
        .factory('registrationLocationFilter', ['appService', 'sessionService', function (appService, sessionService) {
            var selectedUuid;
            var changedByUser = false;
            return {
                getConfig: function () {
                    var appDescriptor = appService.getAppDescriptor();
                    var searchConfig = appDescriptor && appDescriptor.getConfigValue('patientSearch');
                    return searchConfig && searchConfig.locationFilter;
                },
                // Defaults to the login location until the user picks another one (null = all locations)
                getSelectedUuid: function () {
                    return changedByUser ? selectedUuid : sessionService.getLoginLocationUuid();
                },
                setSelectedUuid: function (uuid) {
                    changedByUser = true;
                    selectedUuid = uuid;
                }
            };
        }])
        // Always injected: ui-router fetches the template in parallel with the app config, so the directive decides
        .factory('registrationLocationFilterTemplateInterceptor', function () {
            return {
                response: function (response) {
                    if (searchTemplateUrl.test(response.config.url) && angular.isString(response.data)) {
                        if (searchButton.test(response.data)) {
                            response.data = response.data.replace(searchButton, filterMarkup + '$&');
                        } else {
                            console.warn('Location filter: search button not found in views/search.html, dropdown not added');
                        }
                    }
                    return response;
                }
            };
        })
        .directive('registrationLocationFilter', ['$location', 'locationService', 'registrationLocationFilter',
            function ($location, locationService, registrationLocationFilter) {
                return {
                    restrict: 'A',
                    scope: {},
                    template: '<label for="locationFilter"><strong>{{::config.label | translate}}</strong></label>' +
                        '<select tabindex="7" id="locationFilter" ng-model="filter.uuid" ng-change="onChange()"' +
                        ' ng-options="location.uuid as location.display for location in locations">' +
                        '<option value="">{{::config.allLocationsLabel | translate}}</option>' +
                        '</select>',
                    link: function (scope, element) {
                        var config = registrationLocationFilter.getConfig();
                        if (!config) {
                            element.remove();
                            return;
                        }
                        scope.config = config;
                        scope.filter = {uuid: registrationLocationFilter.getSelectedUuid()};
                        locationService.getAllByTag(config.locationTag || 'Login Location').then(function (response) {
                            scope.locations = _.sortBy(response.data.results, 'display');
                        });
                        scope.onChange = function () {
                            registrationLocationFilter.setSelectedUuid(scope.filter.uuid);
                            // A new search object makes SearchPatientController's $location.search() watch re-run the current search
                            $location.search(angular.copy($location.search()));
                        };
                    }
                };
            }])
        .config(['$provide', '$httpProvider', function ($provide, $httpProvider) {
            $httpProvider.interceptors.push('registrationLocationFilterTemplateInterceptor');
            $provide.decorator('patientServiceStrategy', ['$delegate', 'registrationLocationFilter', function ($delegate, registrationLocationFilter) {
                var search = $delegate.search;
                $delegate.search = function (config) {
                    var params = config && config.params;
                    // Search by patient ID (identifier set) is left unfiltered
                    if (params && params.s === 'byIdOrNameOrVillage' && !params.identifier && registrationLocationFilter.getConfig()) {
                        var locationUuid = registrationLocationFilter.getSelectedUuid();
                        if (locationUuid) {
                            params.loginLocationUuid = locationUuid;
                            params.filterPatientsByLocation = true;
                        }
                    }
                    return search.apply(this, arguments);
                };
                return $delegate;
            }]);
        }]);
})();
