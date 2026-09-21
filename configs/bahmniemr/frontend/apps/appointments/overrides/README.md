# Appointments tags-input configuration

The Compose override mounts `index.html` and `tags-input-config.js` into the
appointments container. The image's `appointment.js` is used unchanged.

The entry page defers Angular bootstrap until the configuration script registers
`tagsInputConfigProvider.setDefaults('tagsInput', { minLength: 1 })`. The script
supports bootstrap occurring before or after it loads, because appointments loads
its constants asynchronously.

This default applies to tags inputs in the appointments application that do not
specify their own `min-length`. It does not change the autocomplete search threshold
or patient search configuration.

To deploy, include the updated frontend files and
`scripts/docker-compose-bahmniemr-overrides.yml` in the distribution, then recreate
the `appointments` service using the deployment's usual Compose files and environment
(`up -d --no-deps --force-recreate appointments`). No image rebuild is required.
`BAHMNI_CONFIG_OVERRIDE_PATH` must point to the deployed `configs/bahmniemr` directory.
Refresh the browser after deployment and verify that H2–H9 can be selected and
removed, along with existing longer location names.

The entry page is based on `bahmni/appointments:1.1.1`. Compare it with the image's
entry page when upgrading, including script names and Angular startup behavior.
