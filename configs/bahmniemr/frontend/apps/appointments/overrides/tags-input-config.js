'use strict';

angular.module('bahmni.appointments').config([
    'tagsInputConfigProvider',
    function (tagsInputConfigProvider) {
        tagsInputConfigProvider.setDefaults('tagsInput', {
            minLength: 1
        });
    }
]);

// Appointments loads its constants asynchronously before calling bootstrap.
// Handle both orders: bootstrap may already be deferred, or may still be pending.
(function () {
    function resume() {
        delete angular.resumeDeferredBootstrap;
        angular.resumeBootstrap();
    }

    if (angular.resumeBootstrap) {
        resume();
    } else {
        angular.resumeDeferredBootstrap = resume;
    }
})();
