# Data acquisition and processing workers

These tools collect and interpret source records; running a worker does not approve a public claim. Start with [the contribution guide](../CONTRIBUTING.md), [data acquisition contract](../docs/data-acquisition-contract.md) and [data brief](../docs/data-needed-brief.md).

## Find the relevant pipeline

| Family                    | Entry points and modules                                    | Responsibility                                                                                          |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Shared intake             | `ingest.py`, `intake_contract.py`                           | Contracts, source auditing and release checks                                                           |
| State development         | `state_development_*`                                       | Source collection, normalized accounting, budget/programme table extraction and publication preparation |
| Odisha                    | `odisha_*`, `ppms_*`                                        | PPMS acquisition, project dossiers and source comparison                                                |
| Parliamentary/local works | `mplads_*`, `egramswaraj_*`                                 | Project collections, source-specific interpretation and cross-record evidence                           |
| Roads                     | `ommas_*`, `nhidcl_*`, related source modules               | Road/tender identity and source evidence                                                                |
| Jurisdiction coverage     | `national_jurisdiction_matrix.py`, related coverage modules | Scoped jurisdiction coverage and known gaps                                                             |
| Other source pilots       | Source-named modules such as `bbmp_*`, `wb_jjm_*`           | Bounded source-specific research and extraction                                                         |

Keep existing command entry points stable. This index groups the existing modules without moving imports merely to create a new directory tree. Extract genuinely shared processing only when multiple pipelines need the same semantics; similarly named financial fields may mean different things.

## Before running acquisition

Read the module's arguments and source-specific documentation. Identify whether it makes network requests, writes originals/checkpoints, stages data or publishes. Do not run acquisition or release commands as part of a formatting/refactoring task.

Outputs should record source identity, retrieval/effective dates, exact units, hashes, locators, parser version and limitations. Keep originals private unless redistribution rights and publication review establish otherwise. Never infer a settled payment from a treasury workflow label or turn an archived coordinate into verified current condition.

## Tests

Use Python 3.12 and install `requirements-dev.txt` in a local virtual environment. Run tests from the repository root:

```sh
python -m unittest discover -s workers -p '*test*.py'
ruff format --check workers scripts
```

Tests use synthetic or bounded fixtures. Review a test before running it if a local workspace contains valuable acquisition work. A fresh checkout deliberately lacks private originals; a test must not require fetching production evidence to pass.
