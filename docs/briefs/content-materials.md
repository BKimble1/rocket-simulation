# Brief: materials and manufacturing layer, glossary, knowledge checks, learning path, why-demos

## You own
`src/content/materials/**` EXCEPT `ids.ts` and `assignments.ts` (read-only, canonical),
`src/content/glossary.ts`, `src/content/checks.ts`, `src/content/learningPath.ts`,
`src/content/why.ts`, `src/content/equations.ts`, `src/content/sources/materials.ts`, and tests
`src/content/*.test.ts` / `src/content/materials/*.test.ts`. Read-only: `src/content/types.ts`
(schema and writing rules), `src/vehicle/parts.ts`, `src/vehicle/spec.ts`,
`src/timeline/missions/outline.ts`, `src/content/sources/core.ts`.

## Deliver
1. `MATERIALS` (`src/content/materials/index.ts`): a `MaterialEntry` for every `MATERIAL_IDS`
   entry. `usedIn` must equal the in-vehicle uses from `partsUsing(id)` in assignments.ts;
   `elsewhere` lists documented designs (named generally with a source). Teach what the brief
   of the product asks: aluminium and Al-Li (density, stiffness/strength, cryogenic toughness,
   weldability, friction-stir welding, buckling of thin pressurized shells: pressure
   stabilization, orthogrid), Al 2219 (weldable, cryogenic), stainless steels (comparison:
   strength at cryogenic and elevated temperature, toughness, fabrication, cost vs mass),
   copper alloys incl. GRCop-42/84 (NASA; conductivity plus strength at temperature in a cooled
   liner; conductivity is not insulation), nickel superalloys (Inconel 718/625 class: strength
   at temperature, oxidation resistance, turbine and GG use), niobium C-103 (radiatively
   cooled extension, silicide coating, why not for the chamber), titanium (grid fins, COPV liners,
   strength to weight, heat tolerance), CFRP sandwich and honeycomb (anisotropy, face sheets vs
   core, layup and cure, inspection limits: hidden disbonds, NDI by ultrasound/thermography),
   COPVs (overwrap carries hoop load, liner seals), ablators (PICA/Avcoat class: pyrolysis,
   char, recession, blowing), ceramic reusable tiles (silica, low conductivity, fragile,
   attachment via strain isolation pad, reuse tradeoffs), MLI (radiation control in vacuum,
   many low-emittance layers), spray-on foam insulation (cryogenic tanks, conduction/convection
   control, not used on this booster), textiles (nylon canopies, aramid risers).
   `properties`: only numbers you can attribute (alloy, temper/condition, temperature, units,
   source id); prefer qualitative comparisons otherwise. Include a cause-and-effect `question`
   per material, e.g. "Why a conductive metal inside a hot engine but an insulating material on
   a heat shield?", "Why does a lightweight shell need reinforcement?", "Why is a composite
   strong in one direction and weaker in another?"
2. `GLOSSARY`: at least 35 terms, including oxidizer, specific impulse, turbopump, gas
   generator, regenerative cooling, throat, expansion ratio, dynamic pressure, max-q, staging,
   ullage, pressurant, COPV, gimbal / thrust vector control, gravity turn, apoapsis, periapsis,
   parking orbit, transfer orbit, delta-v, rendezvous, phasing, docking, ablation, anisotropy,
   sandwich panel, reefing, sphere of influence, flyby, boostback, entry interface, hypergolic,
   TEA-TEB, cryogenic, Karman line. Each `see` links to a part, a demo or a mission phase that
   exists.
3. `CHECKS`: at least 32 optional knowledge checks across all `LearningTopic`s and all `CheckKind`s
   (identify a highlighted part, why a material suits a part, put events in order, distinguish
   confused concepts), each with a supported answer, a specific explanation (why right, why the
   tempting wrong answer is wrong), a `showAgain` target that exists, and sources.
4. `LEARNING_PATH`: anatomy, propulsion, structures/materials, guidance/separation, launch,
   orbit and payload, return/reuse, mission comparisons: blurbs and items that exist.
5. `WHY_DEMOS` (`src/content/why.ts`): why staging reduces carried mass; why tanks are separate;
   why liquid engines may need pumps; why nozzle size differs with operating pressure; why the
   chamber needs cooling; why the vehicle turns during ascent; why orbit requires sideways
   velocity. 3-5 beats each (text + a short `visual` key describing what the scene shows),
   equations where useful, takeaway, sources.
6. `EQUATIONS` (`src/content/equations.ts`): thrust (with the pressure term), dynamic pressure,
   ideal rocket equation, circular orbital speed: every variable explained with units, the
   caveat (what ideal leaves out), and a worked example with THIS vehicle's numbers.
7. A test that recomputes every worked example from `spec.ts` constants (e.g. booster ideal
   delta-v, sea-level thrust from vacuum thrust and exit area, orbital speed at 400 km) and
   checks the numbers quoted in the text; checks link integrity (parts, phases, demos, materials,
   sources), `usedIn` equals the assignments reverse index, glossary coverage of the required
   terms, no em dashes (U+2014) anywhere.

## Quality
Precise, sourced, honest about what is illustrative; explain before quizzing; no scores. You
have no web access to nasa.gov from this environment: cite sources as `accessed: 'reference'`
and give numbers you are confident of with alloy, condition and temperature, or keep it
qualitative. No em dashes.
