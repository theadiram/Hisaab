# District association recovered: Kerala / Keralam

25 October 2026. Private proposals only; no publication or location approvals.

## What was stopping progress

The existing PMGSY candidates use `Keralam`, while the saved LGD export uses `Kerala`. The district matcher requires a unique exact state and district name. Consequently all 471 Kerala road candidates were classified as unmatched, although every district name matches the saved registry exactly once after resolving the state name.

The [official Kerala Forest Department description](https://forest.kerala.gov.in/en/kerala-at-a-glance/) identifies Kerala as also known as Keralam. This supports the source-name correspondence; it is not a statement about the legal effective date of a rename or project boundary allocation. Original PMGSY and LGD state labels remain preserved.

## Implemented recovery

`workers/first_dot_district_recovery.py` creates a separate proposal register. It applies only the documented Kerala/Keralam state-name correspondence, then requires a unique exact district name. It never uses fuzzy district matches, source-code equality across systems, proximity, or inferred historical boundaries.

Each proposal retains the candidate ID, proposed LGD district ID, saved registry hash, original state and district labels, source receipt URL/hash/locator and correspondence reference. Approval, site verification and payment linkage remain false.

| Measure                              | Existing proposals | Combined with this recovery |
| ------------------------------------ | -----------------: | --------------------------: |
| Candidate district proposals         |             52,584 |                      53,055 |
| Districts with candidate proposals   |                570 |                         584 |
| Share of saved 784-district register |             72.70% |                      74.49% |

The 14 additional districts are Alappuzha, Ernakulam, Idukki, Kannur, Kasaragod, Kollam, Kottayam, Kozhikode, Malappuram, Palakkad, Pathanamthitta, Thiruvananthapuram, Thrissur and Wayanad. This is improved administrative association, not 471 newly proved project sites or payments.

## Validation and next step

Five regression tests pass: documented alias recovery remains unapproved; ambiguous district identities are rejected; similar district names are rejected; undocumented state aliases are rejected; existing exact matches are not duplicated. The generator also verifies unique recovered candidate IDs.

Run `python3 workers/first_dot_district_recovery.py` and `python3 -m unittest discover -s workers -p first_dot_district_recovery_test.py`.

The output is `data/acquisition/first-dots/district-recovery.json`. It leaves the baseline registry and proposals unchanged. The correspondence page was checked through web search; its original HTML has not been preserved in this recovery package. Capture/review that source before adopting the proposal register. Then review project-specific source geometry and evidence independently before any map publication.
