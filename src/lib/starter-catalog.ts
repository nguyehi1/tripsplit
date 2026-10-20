/**
 * Starter list catalog: the trip types offered on New trip and the suggested items each one
 * brings to the List tab. DATA ONLY — the logic that merges and de-duplicates these lives in
 * `starter-suggestions.ts`.
 *
 * To add, remove, rename or reorder an item, or change a type's label, edit only this file;
 * the form, the card, the adaptive sentence and the tests all read from it. Array order is
 * tile order on New trip, and item order within a type is the order suggestions appear.
 *
 * EDITING NOTE (content rule): catalog items are generic category names only. Do not add
 * suggestions that imply a person's health, religion or other special-category status (for
 * example specific medications or religious items). "Prescriptions" and "First-aid kit" are
 * generic and fine.
 * Keep items to things the group would plausibly pay for and split (shared purchases, fees and
 * services), not personal packing-list gear such as passports, tents or sleeping bags.
 *
 * A new type with a sensitive subject (health, religion, sexuality, finances of a named
 * person) also needs its own compliance review before it ships.
 *
 * Adding a NEW type needs more than an entry here: the database only accepts the codes listed in
 * `trips_types_check`, so it also needs a new numbered migration that drops and re-adds that
 * constraint with the extra code (and a higher cardinality bound), plus a row in
 * docs/reference/analytics-events.md for its `trip_type_selected_<code>` event. Two tests fail until both exist.
 * See docs/features/starter-list-exploration/architecture.md section 3.
 */

export const STARTER_TYPES = [
  {
    code: "camping",
    label: "Camping",
    // Used in "Your list will open with suggestions for ..." on New trip.
    phrase: "camping",
    items: [
      "Campsite fee",
      "Firewood",
      "Fuel canisters",
      "Ice",
      "Groceries",
      "Coffee",
      "Snacks",
      "Drinks",
      "Water jugs",
      "Propane",
      "Lighter and matches",
      "Trash bags",
      "Paper towels",
      "Toilet paper",
      "Bug spray",
      "Sunscreen",
      "Parking and park entry",
      "Gas for the drive",
    ],
  },
  {
    code: "airbnb",
    label: "Airbnb stay",
    phrase: "an Airbnb stay",
    items: [
      "Airbnb fee",
      "Pet fee", 
      "Toilet paper",
      "Paper towels",
      "Dish soap",
      "Trash bags",
      "Coffee and filters",
      "Cooking oil",
      "Salt and pepper",
      "Snacks",
      "Breakfast basics",
      "Groceries",
      "Drinks",
      "Drinking water",
      "Laundry pods",
      "Cleaning fee",
      "Parking",
      "Group dinner",
      "Gas for the drive",
    ],
  },
  {
    code: "international",
    label: "International",
    phrase: "international travel",
    items: [
      "Travel insurance",
      "SIM or eSIM",
      "Airport transfers",
      "Local transport",
      "Rental car",
      "Fuel and tolls",
      "Group dinners",
      "Hotel/Airbnb fees",
      "Tours and activities",
      "Entry tickets",
      "Groceries",
      "Drinks",
      "Tips",
      "Parking",
    ],
  },
] as const;

/** The fourth tile on New trip. Not a catalog type: no code, no items, no suggestions. */
export const OTHER_TILE_LABEL = "Other";

export type TripType = (typeof STARTER_TYPES)[number]["code"];
