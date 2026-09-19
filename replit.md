# Coral Auto Spa on Replit

## Run

- The web app runs with `npm start`.
- The Replit workflow runs `PORT=5000 npm start` and opens the site in the web preview.
- The server binds to `0.0.0.0` and uses the `PORT` environment variable.
- There are no npm dependencies or build step.

## Current limitations

- Booking requests are appended to the local `bookings.log` file. This file is gitignored and is not durable across deployments.
- Replace the placeholder business contact details, package pricing, reviews, and service promises before publishing.