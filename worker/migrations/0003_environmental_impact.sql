-- Environmental impact: estimated, not measured. See src/lib/impact.js
-- for the calculation and its methodology/citation.
ALTER TABLE journeys ADD COLUMN vehicle_type TEXT; -- electric | hybrid | petrol | diesel | other (offer journeys only)
ALTER TABLE bookings ADD COLUMN impact_json TEXT NOT NULL DEFAULT '{}'; -- estimated impact, set when a booking completes
