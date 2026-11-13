# Incident: 2026-11-13 16-31-09

## Summary

Between 16:31 and 16:41 UTC on 2026-11-13, every pizza order placed through JWT Pizza failed. The JWT Pizza Factory, the third-party service that creates the pizza for each order, began rejecting every order request with a `500 "chaos monkey"` error as part of a scheduled chaos test. JWT Pizza Service passed the failure on to diners as `500 "Failed to fulfill order at factory"`.

The incident was detected by Grafana alerting, which paged the on-call engineer through Grafana OnCall 38 seconds after the first failed order. The engineer found the factory's error and its `reportUrl` in the service logs and reported the problem at that link, which restored the factory. This high-severity incident stopped 100% of pizza purchases (53 of 53 orders failed) for about 10 minutes. Logins, menus, and order history were unaffected. No support tickets were raised, since the only traffic during the incident was simulated.

## Detection

This incident was detected when the Factory errors in logs alert fired at 16:31:10, one second after the first failed order. The on-call engineer (Ethan Cox) was paged through Grafana OnCall at 16:31:47. Two more alerts confirmed the problem from the metrics side about two minutes later. They have a one-minute pending period, so they fired at 16:33:10 and paged at 16:33:40 and 16:33:44:

| Alert | Source | Fired | Paged |
| --- | --- | --- | --- |
| Factory errors in logs | Loki: factory logs with `level="error"` | 16:31:10 | 16:31:47 |
| HTTP error rate | Prometheus: HTTP 5xx responses > 2 / minute | 16:33:10 | 16:33:40 |
| Pizza creation failures | Prometheus: failed pizza orders > 0 / minute | 16:33:10 | 16:33:44 |

**Near miss:** detection worked only because the traffic simulation had been restarted by hand. The scheduled GitHub Actions run meant to start the traffic at 14:30 never ran. Production had no orders until the engineer noticed at 16:19 and started the traffic manually at 16:20:58. If the chaos had started before then, no alert could have fired, because nothing was ordering pizza. See Action items.

## Impact

For 10 minutes, between 16:31:09 and 16:41:07 UTC on 11/13/26, diners could not buy pizza. Every order request returned `500 "Failed to fulfill order at factory"`.

- **Orders:** 53 of 53 orders placed during the incident failed (100%). No pizzas were sold, and no revenue was recorded.
- **Users:** the only user ordering at the time was the simulated diner account (`d@jwt.com`). In production, every diner trying to order would have been affected.
- **Unaffected:** logins, the menu, franchise pages, and order history all kept working normally. CPU, memory, and request latency stayed normal.
- **Support:** no support tickets or social media posts were raised, since the traffic was simulated.

## Timeline

All times are UTC on 2026-11-13.

- _14:30_ - The scheduled "Simulate traffic" GitHub Actions run was due to start. It never ran, so production received no orders.
- _16:19_ - The on-call engineer noticed there was no simulated traffic and no factory activity in the logs.
- _16:20:58_ - The engineer started the traffic simulation by hand. The first order was placed at 16:21:05.
- _16:21_ - _16:30_ - Orders succeeded normally, about 6 per minute.
- _16:30:58_ - Last successful order before the incident.
- _16:31:09_ - **First failed order.** The factory returned `500 {"message":"chaos monkey","reportUrl":"https://pizza-factory.cs329.click/api/support/..."}`.
- _16:31:10_ - The **Factory errors in logs** alert fired.
- _16:31:47_ - **First page** (Factory errors in logs) sent through Grafana OnCall.
- _16:33:10_ - The **HTTP error rate** and **Pizza creation failures** alerts fired after their one-minute pending period.
- _16:33:40_ and _16:33:44_ - Pages sent for HTTP error rate and Pizza creation failures.
- _16:36:28_ - The engineer acknowledged the Pizza creation failures page.
- _16:36:38_ - The engineer acknowledged the HTTP error rate page.
- _~16:38_ - The engineer began investigating the Logs table on the Pizza Dashboard, starting from when the errors began, and found the factory's `chaos monkey` error and its report link.
- _16:41:07_ - **Last failed order.**
- _~16:41_ - The engineer reported the problem at the factory's report link.
- _16:41:18_ - **First successful order after the incident. Service restored.**
- _16:42:10_ - The HTTP error rate alert returned to normal.
- _16:42:20_ - The engineer acknowledged the Factory errors in logs page.
- _16:42:44_ - _16:42:47_ - The engineer resolved all three alert groups in OnCall.
- _16:43:10_ - The Pizza creation failures alert returned to normal.
- _16:46:10_ - The Factory errors in logs alert returned to normal, once the last factory error left its 5-minute window.

## Response

After receiving the first page at 16:31:47 UTC on the Grafana OnCall mobile app, the on-call engineer (Ethan Cox) acknowledged the pizza failure and HTTP error pages at 16:36:28 and 16:36:38, about 4.5 minutes after the first page. At about 16:38, the engineer began investigating in Grafana, using the Pizza Dashboard's Logs table. The engineer focused on the logs from when the errors first began to spike, which led straight to the cause.

The failed `POST /api/order` and factory log entries from that period showed the cause directly: the factory's response body read `"message":"chaos monkey"` and included a `reportUrl`, which the service passes on to clients as `followLinkToEndChaos`. The engineer reported the issue at that link, and orders recovered within seconds. Total time from the first page to restored service was about 9.5 minutes.

No escalation to a second responder was needed. The Factory errors in logs page was acknowledged last, at 16:42:20, so its escalation chain likely sent its follow-up Important notification while the engineer was already working the incident.

## Root cause

The JWT Pizza Factory, an external dependency that JWT Pizza Service calls for every order, had chaos injected into it. It rejected every order request with `500 "chaos monkey"` until the problem was reported at the factory's report URL.

JWT Pizza Service itself behaved correctly. It caught the factory's error, logged it with the full response body, counted it as a failed pizza, and returned a clear error to the diner. No service code was involved. The service does depend completely on the factory for every purchase, though, with no retry, fallback, or queue, so any factory outage is immediately a total outage of pizza purchases.

**What needs to change:** to keep this class of incident from happening again, JWT Pizza needs to reduce how much it depends on the factory being available at the moment a diner orders. For example, it could accept and save orders even when the factory is down, then retry them once the factory recovers, or route orders to a second factory if one becomes available. A factory outage would then delay pizzas instead of stopping purchases altogether.

## Resolution

The engineer identified the factory as the source from the failed order and factory log entries. Their response bodies carried the factory's `chaos monkey` message and the `reportUrl` for reporting the problem. Visiting that URL reported the issue to the factory, which stopped rejecting orders. The first successful order went through at 16:41:18, 11 seconds after the last failure. No code changes, deployments, or restarts were needed.

The incident was declared over once:
- orders were consistently succeeding again,
- the Pizza creation failures and HTTP error rate alerts had returned to normal (16:42–16:43),
- and all three OnCall alert groups were resolved (16:42:47).

**Improving time to mitigation:** the response was already reasonably quick. Service was restored about 9.5 minutes after the first page, and the fix itself took seconds once the cause was found. Most of that time was spent getting to a computer and starting the investigation after the page, which is hard to shorten much further. The diagnosis step could still be faster with a short playbook for factory alerts: open the Logs table, filter to `type=factory`, and follow the `reportUrl` in the error response.

## Prevention

This is the first recorded incident for JWT Pizza Service, so there are no earlier incidents with the same root cause.

Because the root cause is a dependency outside our control, prevention focuses on detecting it quickly and limiting its impact, rather than on stopping it from happening.

## Action items

1. **Make the traffic simulation reliable** (owner: Ethan Cox). The scheduled GitHub Actions run did not start. Verify scheduled workflows run in this forked repository, or trigger the simulation from a source that does not depend on the schedule. Also add an alert for missing order traffic during a testing window, so a stopped simulation is noticed right away.
1. **Write a playbook for factory alerts** (owner: Ethan Cox). Document the steps for diagnosing factory failures: open the Logs table, filter to `type=factory`, and follow the `reportUrl` in the error response.
1. **Reduce dependence on the factory** (owner: development team). Accept and queue orders when the factory is unavailable, then retry them once it recovers, so a factory outage delays pizzas instead of stopping purchases.

## Changes made

The chaos did trigger the alerts (Factory errors in logs, HTTP error rate, and Pizza creation failures), so no alert rules had to be changed after the incident. These changes were made beforehand to prepare for the chaos test:

- **Metrics:** added an `http_errors` counter for responses with a 5xx status.
- **Alerts:** added Pizza creation failures, Pizza creation latency, Factory errors in logs, CPU usage high, Memory usage high, and HTTP error rate. All of them page the on-call engineer through Grafana OnCall (contact point "JWT Pizza DevOps Contact", escalation chain "JWT Pizza").
- **Dashboard:** added panels for alert status, factory requests by level, CPU and memory over time, and HTTP 5xx errors per minute.
- **Traffic:** added `simulateTraffic.sh` and the "Simulate traffic" GitHub Actions workflow, which generates steady order traffic with no deliberate failures.
- **Chaos endpoint:** added an admin-only chaos endpoint to JWT Pizza Service, used to test the alerts before the incident.
