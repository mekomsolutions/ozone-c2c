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
// A patient belongs to the location whose identifier prefix (location attribute "id_prefix", the one idgen uses)
// is on their primary identifier, e.g. H02-2000000 -> H2.
(function () {
    var searchTemplateUrl = /(^|\/)views\/search\.html$/;
    var searchButton = /<article class="fl">\s*<div class="reg-srch-btn">/;
    var filterMarkup = '<article class="fl" registration-location-filter></article>';

    angular.module('registration')
        .factory('registrationLocationFilter', ['$http', '$q', 'appService', 'sessionService', function ($http, $q, appService, sessionService) {
            var selectedUuid;
            var changedByUser = false;
            var locations;

            var getConfig = function () {
                var appDescriptor = appService.getAppDescriptor();
                var searchConfig = appDescriptor && appDescriptor.getConfigValue('patientSearch');
                return searchConfig && searchConfig.locationFilter;
            };

            // Tagged locations that have an identifier prefix, sorted by name
            var getLocations = function () {
                if (!locations) {
                    var config = getConfig();
                    var prefixAttribute = config.identifierPrefixAttribute || 'id_prefix';
                    locations = $http.get(Bahmni.Common.Constants.locationUrl, {
                        params: {
                            s: 'byTags',
                            tags: config.locationTag || 'Login Location',
                            operator: 'ALL',
                            v: 'custom:(uuid,display,attributes:(value,voided,attributeType:(name)))'
                        },
                        withCredentials: true
                    }).then(function (response) {
                        var withPrefix = _.map(response.data.results, function (location) {
                            var prefix = _.find(location.attributes, function (attribute) {
                                return !attribute.voided && attribute.attributeType && attribute.attributeType.name === prefixAttribute;
                            });
                            return {uuid: location.uuid, display: location.display, identifierPrefix: prefix && prefix.value};
                        });
                        return _.sortBy(_.filter(withPrefix, 'identifierPrefix'), 'display');
                    }, function (error) {
                        locations = null;
                        return $q.reject(error);
                    });
                }
                return locations;
            };

            // Defaults to the login location until the user picks another one (null = all locations)
            var getSelectedUuid = function () {
                return changedByUser ? selectedUuid : sessionService.getLoginLocationUuid();
            };

            return {
                getConfig: getConfig,
                getLocations: getLocations,
                getSelectedUuid: getSelectedUuid,
                setSelectedUuid: function (uuid) {
                    changedByUser = true;
                    selectedUuid = uuid;
                },
                getSelectedIdentifierPrefix: function () {
                    var uuid = getSelectedUuid();
                    if (!uuid) {
                        return $q.when(null);
                    }
                    return getLocations().then(function (all) {
                        var location = _.find(all, {uuid: uuid});
                        return location ? location.identifierPrefix : null;
                    });
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
        .directive('registrationLocationFilter', ['$location', 'registrationLocationFilter',
            function ($location, registrationLocationFilter) {
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
                        registrationLocationFilter.getLocations().then(function (locations) {
                            scope.locations = locations;
                            // Login location without an identifier prefix: nothing to filter on, show "all locations"
                            if (scope.filter.uuid && !_.find(locations, {uuid: scope.filter.uuid})) {
                                scope.filter.uuid = null;
                                registrationLocationFilter.setSelectedUuid(null);
                            }
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
            $provide.decorator('patientServiceStrategy', ['$delegate', '$http', 'registrationLocationFilter', function ($delegate, $http, registrationLocationFilter) {
                var search = $delegate.search;
                $delegate.search = function (config) {
                    var params = config && config.params;
                    // Search by patient ID (identifier set) is left unfiltered
                    if (!params || params.s !== 'byIdOrNameOrVillage' || params.identifier || !registrationLocationFilter.getConfig()) {
                        return search.apply($delegate, arguments);
                    }
                    return registrationLocationFilter.getSelectedIdentifierPrefix().then(function (identifierPrefix) {
                        if (!identifierPrefix) {
                            return search.call($delegate, config);
                        }
                        // bahmnicommons ANDs "identifier" (primary identifier LIKE %prefix%) with the name/address/attribute criteria.
                        // Called directly because the strategy switches to the /lucene endpoint whenever identifier is set.
                        params.identifier = identifierPrefix;
                        return $http.get(Bahmni.Common.Constants.bahmniCommonsSearchUrl + '/patient', config).then(function (response) {
                            return response.data;
                        });
                    });
                };
                return $delegate;
            }]);
        }]);
})();
