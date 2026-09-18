# frost.bg — CI и публикуване

GitHub origin е primary, GitLab gitlab е ръчно обновявано огледало след сливане.
Не изпълнявай deploy като част от CI промяна. Не променяй runner 1.
Работи в отделен branch, пази чуждите промени и използвай exact-path staging.
Пълните тестове са `npm test`: worker, site, Python grid и CDS.
Нужни са Node 24.21.0, Python 3.12 и grid/requirements-cds.txt; изпълняват се non-root.

Преди push използвай общия tool от standard_sha в .ci-contract.json:
`python3 /Users/gun/Developer/Projects/CodingProjects/ci-standards/scripts/ci-check preflight --repo "$PWD" --remote gitlab --ref main`.
След преглед/сливане публикувай main първо в origin, после gitlab, без force.
След GitLab push: същата команда с `verify --sha SHA --pipeline-id ID --source push`.
READY е runner готовност; PASS изисква std_repository и validate_application
за точния SHA, source и непроменен branch tip. Не приемай pending/skipped за успех.
След 120 s pending провери runner tags/online/paused/заетост; не чакай безкрайно.
При въвеждане или промяна на CI докажи втори цял pipeline чрез API за същия SHA,
verify --source api и сравнение на runner/workspace. Не използвай retry на успешен run.

Общият include и tool са pin-нати към един приет immutable release SHA.
Няма автоматичен Git hook или непроменима CE политика. Пази частните receipts
извън repo. Rollback: нормален revert само на CI/contract/инструкциите и свързаните
whitespace поправки; пази историята и GitHub CI. Не изтривай repo или runner.
