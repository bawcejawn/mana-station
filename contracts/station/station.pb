
íh
assembly/proto/station.protostationkoinos/options.proto"Ò
config_object
owner (BÄµRowner
paused (Rpaused#
koin_amount (B0R
koinAmount
	refill_bp (RrefillBp
	admin_min (B0RadminMin
hard_max (B0RhardMax
per_min (RperMin#
cooldown_ms (B0R
cooldownMs
day_actions	 (R
dayActions
day_mana
 (B0RdayMana
new_actions (R
newActions
new_mana (B0RnewMana
new_pct (RnewPct
max_ops (RmaxOps
big_max (B0RbigMax*
big_cooldown_ms (B0RbigCooldownMs$
big_week_cap (B0R
bigWeekCap$
big_max_debt (B0R
bigMaxDebt&
big_ticket_ms (B0RbigTicketMs%
max_allowances (RmaxAllowances
max_days (B0RmaxDays 
treasury (BÄµRtreasury
	buffer_bp (RbufferBp!

alert_mana (B0R	alertMana"
ticket_fee_bp (RticketFeeBp"
max_per_buyer (RmaxPerBuyer
council (BÄµRcouncil
	threshold (R	threshold(
guard_delay_ms (B0RguardDelayMs
open_cap  (RopenCapJJ"ï

app_object'
reserved_mana (B0RreservedMana
active (Ractive!

boost_mana (B0R	boostMana#
boost_until (B0R
boostUntil"9
exempt_object
app (Rapp
strict (Rstrict"}
exempt_event%
contract_id (BÄµR
contractId,
value (2.station.exempt_objectRvalue
removed (Rremoved"Q
entry_object
app (Rapp
cap (B0Rcap
max_args (RmaxArgs"l
window_object
base (B0Rbase
n (Rn
mana (B0Rmana
new_mana (B0RnewMana"Ÿ
user_object!

first_seen (B0R	firstSeen!

last_block (B0R	lastBlock
minute (B0Rminute
n_min (RnMin)
cooldown_until (B0RcooldownUntil(
day (2.station.window_objectRday"Ë
price_object
active (Ractive,
max_per_purchase (B0RmaxPerPurchase
price_1d (B0Rprice1d
price_7d (B0Rprice7d
	price_30d (B0Rprice30d$
big_per_1000	 (B0R
bigPer1000$
big_min_mana
 (B0R
bigMinMana%
min_purchase (B0RminPurchase.
pass_min_purchase (B0RpassMinPurchaseJJJ"Å
allowance_object
id (Rid
buyer (BÄµRbuyer
kind (Rkind
target (BÄµRtarget$
mana_per_day (B0R
manaPerDay
expiry (B0Rexpiry(
day (2.station.window_objectRday
token (BÄµRtoken
	term_days	 (B0RtermDays!

unit_price
 (B0R	unitPrice
paid (B0Rpaid!

term_start (B0R	termStart!

total_paid (B0R	totalPaid!
purchase_ids (RpurchaseIds!

used_total (B0R	usedTotal
	cap_total (B0RcapTotal"Ω
ticket_object
buyer (BÄµRbuyer
mana (B0Rmana 
	remaining (B0R	remaining
expiry (B0Rexpiry!
allow_upload (RallowUpload
token (BÄµRtoken
paid (B0Rpaid
purchase_id (R
purchaseId
bought	 (B0Rbought&
prev_last_buy
 (B0RprevLastBuy"±

big_object
debt (B0Rdebt
debt_ts (B0RdebtTs
last_buy (B0RlastBuy*
week (2.station.window_objectRweek
next_id (RnextId
low_alerted (R
lowAlerted#
next_purchase (RnextPurchase
	paused_at (B0RpausedAt#
ticket_open	 (B0R
ticketOpen"Ç
purchase_event7
	allowance (2.station.allowance_objectR	allowance.
ticket (2.station.ticket_objectRticket
token (BÄµRtoken
paid (B0Rpaid

refundable (R
refundable

auto_renew (R	autoRenew
terms (	Rterms"‚
buffer_event
app (Rapp
payee (BÄµRpayee
rc (B0Rrc$
app_used_24h (B0R
appUsed24h 
	allowance (B0R	allowance%
buffer_limit (B0RbufferLimit!

mana_after (B0R	manaAfter"Ä
reserve_alert_event!

mana_after (B0R	manaAfter#
alert_level (B0R
alertLevel!

hard_floor (B0R	hardFloor"›
registry_object
app_ids (RappIds
open_ids (RopenIds%
open_purchases (RopenPurchases#

exempt_ids (BÄµR	exemptIds%
open_proposals (RopenProposals#
next_proposal (RnextProposal"h
kcs_approve_args
owner (BÄµRowner
spender (BÄµRspender
value (B0Rvalue"Ä
guarded_action
kind (Rkind
hash (BÄµRhash
to (BÄµRto
amount (B0Ramount
token (BÄµRtoken
council (BÄµRcouncil
	threshold (R	threshold
delay_ms (B0RdelayMs
fee_bp	 (RfeeBp"∏
proposal_object
id (Rid/
action (2.station.guarded_actionRaction 
proposer (BÄµRproposer"
	approvals (BÄµR	approvals
created (B0Rcreated
ready_at (B0RreadyAt
executed (Rexecuted
	cancelled (R	cancelled'
cancelled_by	 (BÄµRcancelledBy"p
proposal_event4
proposal (2.station.proposal_objectRproposal
by (BÄµRby
what (	Rwhat"Ö
connected_app%
contract_id (BÄµR
contractId
app (Rapp$
mana_per_day (B0R
manaPerDay!

boost_mana (B0R	boostMana#
boost_until (B0R
boostUntil
strict (Rstrict
active (Ractive
used_24h (B0Rused24h"Á
paid_app
id (Rid
buyer (BÄµRbuyer
target (BÄµRtarget$
mana_per_day (B0R
manaPerDay
expiry (B0Rexpiry
used_24h (B0Rused24h
	suspended (R	suspended
kind (Rkind"€
escrow_object
id (Rid
kind (Rkind
buyer (BÄµRbuyer
token (BÄµRtoken
amount (B0Ramount
start (B0Rstart
end (B0Rend
days (B0Rdays
per_day	 (B0RperDay!
allowance_id
 (RallowanceId
payee (BÄµRpayee
mana (B0Rmana
refunded (B0Rrefunded
released (B0Rreleased
closed (Rclosed
min_keep (B0RminKeep
	day_price (B0RdayPrice"ê
escrow_totals_object
held (B0Rheld 
	collected (B0R	collected
refunded (B0Rrefunded
released (B0Rreleased"å
escrow_event2
purchase (2.station.escrow_objectRpurchase
amount (B0Ramount
to (BÄµRto
action (	Raction"*
revenue_object
total (B0Rtotal"
get_status_arguments"—
get_status_result.
config (2.station.config_objectRconfig
mana (B0Rmana%
daily_budget (B0RdailyBudget'
reserve_floor (B0RreserveFloor
	big_floor (B0RbigFloor
used_24h (B0Rused24h'
sold_capacity (B0RsoldCapacity)
sold_committed (B0RsoldCommitted
big_debt	 (B0RbigDebt*
buffer_used_24h
 (B0RbufferUsed24h#
alert_level (B0R
alertLevel 
treasury (BÄµRtreasury".
get_user_arguments
user (BÄµRuser"{
get_user_result(
user (2.station.user_objectRuser
actions_24h (R
actions24h
mana_24h (B0Rmana24h"%
get_app_arguments
app (Rapp"û
get_app_result%
app (2.station.app_objectRapp 
	allowance (B0R	allowance
used_24h (B0Rused24h$
new_used_24h (B0R
newUsed24h"]
get_entry_arguments%
contract_id (BÄµR
contractId
entry_point (R
entryPoint"?
get_entry_result+
entry (2.station.entry_objectRentry"â
quote_allowance_arguments
token (BÄµRtoken$
mana_per_day (B0R
manaPerDay
days (B0Rdays
kind (Rkind"É
quote_allowance_result

refundable (R
refundable

auto_renew (R	autoRenew
terms (	Rterms
price (B0Rprice
	available (R	available
reason (	Rreason!

unit_price (B0R	unitPrice!

min_charge (B0R	minCharge"P
quote_big_upload_arguments
token (BÄµRtoken
mana (B0Rmana"©
quote_big_upload_result

refundable (R
refundable

auto_renew (R	autoRenew
terms (	Rterms
price (B0Rprice
	available (R	available
reason (	Rreason!

unit_price (B0R	unitPrice!

min_charge (B0R	minCharge#
lifetime_ms	 (B0R
lifetimeMs")
get_allowance_arguments
id (Rid"n
get_allowance_result7
	allowance (2.station.allowance_objectR	allowance
used_24h (B0Rused24h"2
get_ticket_arguments
payee (BÄµRpayee"C
get_ticket_result.
ticket (2.station.ticket_objectRticket"‚
buy_allowance_arguments
buyer (BÄµRbuyer
kind (Rkind
target (BÄµRtarget$
mana_per_day (B0R
manaPerDay
days (B0Rdays
token (BÄµRtoken
	max_price (B0RmaxPrice"Z
buy_allowance_result
id (Rid
expiry (B0Rexpiry
paid (B0Rpaid"í
renew_arguments
payer (BÄµRpayer
id (Rid
days (B0Rdays
token (BÄµRtoken
	max_price (B0RmaxPrice"e
renew_result
expiry (B0Rexpiry
paid (B0Rpaid!

unit_price (B0R	unitPrice"ˆ
buy_big_upload_arguments
buyer (BÄµRbuyer
payee (BÄµRpayee
mana (B0Rmana
token (BÄµRtoken
	max_price (B0RmaxPrice!
allow_upload (RallowUpload*
min_lifetime_ms (B0RminLifetimeMs"K
buy_big_upload_result
expiry (B0Rexpiry
paid (B0Rpaid"4
close_ticket_arguments
payee (BÄµRpayee"Q
close_ticket_result
refund (B0Rrefund
released (B0Rreleased"H
cancel_allowance_arguments
buyer (BÄµRbuyer
id (Rid"Q
cancel_allowance_result
refund (B0Rrefund
expiry (B0Rexpiry"U
cancel_big_upload_arguments
buyer (BÄµRbuyer
payee (BÄµRpayee"6
cancel_big_upload_result
refund (B0Rrefund"4
release_arguments
purchase_id (R
purchaseId",
release_result
amount (B0Ramount"d
owner_refund_arguments!
allowance_id (RallowanceId'
ticket_payee (BÄµRticketPayee"1
owner_refund_result
refund (B0Rrefund"7
get_escrow_arguments
purchase_id (R
purchaseId"í
get_escrow_result2
purchase (2.station.escrow_objectRpurchase)
refundable_now (B0RrefundableNow

releasable (R
releasable"9
get_escrow_totals_arguments
token (BÄµRtoken"Q
get_escrow_totals_result5
totals (2.station.escrow_totals_objectRtotals"ô
op_info%
contract_id (BÄµR
contractId
entry_point (R
entryPoint
args (BÄµRargs
upload (Rupload
other (Rother"Ç
would_pay_arguments
payee (BÄµRpayee0

operations (2.station.op_infoR
operations
rc_limit (B0RrcLimit":
would_pay_result
pay (Rpay
route (	Rroute"@
init_arguments.
config (2.station.config_objectRconfig"
init_result"F
set_config_arguments.
config (2.station.config_objectRconfig"
set_config_result".
set_paused_arguments
paused (Rpaused"
set_paused_result"P
set_app_arguments
app (Rapp)
value (2.station.app_objectRvalue"
set_app_result"¢
set_entry_arguments%
contract_id (BÄµR
contractId
entry_point (R
entryPoint+
value (2.station.entry_objectRvalue
remove (Rremove"
set_entry_result"B
suspend_object
reason (Rreason
since (B0Rsince"u
suspend_event
buyer (BÄµRbuyer
reason (Rreason
	suspended (R	suspended
at (B0Rat"Q
suspend_allowance_arguments
buyer (BÄµRbuyer
reason (Rreason"
suspend_allowance_result"S
unsuspend_allowance_arguments
buyer (BÄµRbuyer
reason (Rreason"
unsuspend_allowance_result"6
get_suspension_arguments
buyer (BÄµRbuyer"P
get_suspension_result7

suspension (2.station.suspend_objectR
suspension"É
set_exempt_arguments%
contract_id (BÄµR
contractId,
value (2.station.exempt_objectRvalue
remove (Rremove"
set_exempt_result"=
get_exempt_arguments%
contract_id (BÄµR
contractId"C
get_exempt_result.
exempt (2.station.exempt_objectRexempt"^
set_price_arguments
token (BÄµRtoken+
value (2.station.price_objectRvalue"
set_price_result"|
connect_app_arguments%
contract_id (BÄµR
contractId$
mana_per_day (B0R
manaPerDay
strict (Rstrict"&
connect_app_result
app (Rapp"A
disconnect_app_arguments%
contract_id (BÄµR
contractId"
disconnect_app_result"
list_connected_arguments"ä
list_connected_result3
	free_apps (2.station.connected_appRfreeApps%
paid (2.station.paid_appRpaid%
daily_budget (B0RdailyBudget
reserved (B0Rreserved
sellable (B0Rsellable
sold (B0Rsold
mana (B0Rmana"b
propose_arguments
signer (BÄµRsigner/
action (2.station.guarded_actionRaction" 
propose_result
id (Rid"A
approve_arguments
signer (BÄµRsigner
id (Rid"/
approve_result
ready_at (B0RreadyAt"I
cancel_proposal_arguments
signer (BÄµRsigner
id (Rid"
cancel_proposal_result"#
execute_arguments
id (Rid"
execute_result"(
get_proposal_arguments
id (Rid"K
get_proposal_result4
proposal (2.station.proposal_objectRproposal"
list_proposals_arguments"O
list_proposals_result6
	proposals (2.station.proposal_objectR	proposalsbproto3
Á
koinos/chain/authority.protokoinos.chainkoinos/options.proto"U
call_target%
contract_id (BÄµR
contractId
entry_point (R
entryPoint"à
authorize_arguments4
type (2 .koinos.chain.authorization_typeRtype2
call (2.koinos.chain.call_targetH RcallàB
_call"(
authorize_result
value (Rvalue*Y
authorization_type
contract_call 
transaction_application
contract_uploadB4Z2github.com/koinos/koinos-proto-golang/koinos/chainbproto3