/**
 * Filled-in examples for the strongest document templates (owner decision 25.11.2026). Search Console, 90 days:
 * "example/sample" 3,753 impressions, "free" 3,665, "word/docx" 1,958. Each example follows the template's own
 * sections, written by hand with fictional people, companies and numbers; none of them is a real person or business.
 * generate-free-templates.mjs shows the example on the page ("Filled-in example"), writes it into templates.json as
 * `exampleMarkdown`, and builds a Word download of the template and of the example from the same Markdown.
 *
 * Rule for new entries: no [placeholders], no lorem ipsum, numbers that add up, dates that fit together.
 */

export const FILLED_EXAMPLES = {
  "software-requirements-specification-template": {
    summary:
      "A regional plumbing supplier specifies a delivery-tracking app for its drivers and dispatchers: eight numbered requirements, measurable performance targets and a fixed budget and launch date.",
    markdown: `# Software Requirements Specification: RouteLedger Driver App

**Version:** 1.3 · **Date:** March 9, 2026 · **Author:** Priya Raman, Product Manager, Calloway Plumbing Supply

## 1. Purpose
RouteLedger replaces the paper delivery sheets used by Calloway Plumbing Supply's 38 drivers across four branches in Ohio. Drivers confirm each delivery on a phone with a photo and the customer's signature; dispatchers see every truck's progress live and answer "where is my order?" calls without phoning the driver.

## 2. Scope
**In scope:** driver route list, proof of delivery (photo, signature, recipient name), partial deliveries and returns, live dispatcher map, automatic delivery confirmation email to the customer, daily export of completed deliveries to the ERP.
**Out of scope:** route optimization, customer self-service tracking portal, invoicing and payment collection on site. These are planned for version 2.

## 3. Functional Requirements
| ID | Requirement | Priority |
|----|-------------|-----------|
| FR-1 | The system shall show each driver the day's stops in the order set by dispatch, with address, contact and order lines. | Must |
| FR-2 | The system shall record proof of delivery: at least one photo, the recipient's printed name and an on-screen signature. | Must |
| FR-3 | The system shall let a driver mark individual order lines as delivered, short or refused, with a reason code. | Must |
| FR-4 | The system shall store deliveries on the phone when there is no signal and upload them within 60 seconds of reconnecting. | Must |
| FR-5 | The system shall show dispatchers every active truck on a map, refreshed at least every 2 minutes. | Must |
| FR-6 | The system shall email the customer a delivery confirmation with photo and signature within 5 minutes of completion. | Should |
| FR-7 | The system shall export all completed deliveries to the ERP as a CSV file at 11:00 p.m. each day. | Should |
| FR-8 | The system shall let a branch manager reassign a stop to another driver during the day. | Could |

## 4. Non-Functional Requirements
- **Performance:** the route list opens in under 2 seconds on a 4G connection; a proof-of-delivery upload completes in under 10 seconds.
- **Availability:** 99.5% during delivery hours (6:00 a.m. to 7:00 p.m. Eastern, Monday to Saturday).
- **Security:** single sign-on with the company's existing Microsoft accounts; all data encrypted in transit and at rest; photos and signatures kept 7 years, then deleted.
- **Devices:** Android 12 or later and iOS 16 or later; usable with work gloves (touch targets at least 48 px).
- **Scalability:** up to 120 drivers and 1,500 stops a day without changes to the architecture.

## 5. User Roles
- **Driver:** sees own route only; records deliveries, returns and notes.
- **Dispatcher:** builds routes, sees all trucks of the branch, edits stop order.
- **Branch manager:** everything a dispatcher can do, plus reassigning stops and viewing reports for the branch.
- **Administrator (IT):** manages users, reason codes and the ERP export settings.

## 6. Constraints
Fixed budget of $180,000 for version 1, including the first year of hosting. Go-live at all four branches by September 1, 2026, before the fall heating season. The ERP can only receive data as a nightly CSV import; no real-time interface is available.

## 7. Assumptions and Dependencies
Every driver has a company phone with a data plan (purchase approved February 2026). Customer email addresses in the ERP are at least 90% complete; the sales team cleans up the rest by July 1, 2026. The map relies on a commercial mapping service whose license is already part of the dispatch budget.

*Requirements written as testable statements ("the system shall...") are far easier to verify at launch than vague goals — if you can't write a test for it, it's not specific enough yet.*`,
  },

  "payment-request-template": {
    summary:
      "A facilities coordinator asks the controller to pay an HVAC contractor for an emergency compressor replacement, with the invoice, purchase order and photos attached.",
    markdown: `# Payment Request

**Requested by:** Daniel Okafor, Facilities Coordinator · **Date:** April 14, 2026
**Payable to:** Brightwater HVAC Services LLC

## Details
Amount requested: $4,860.00
Reason/purpose: Emergency replacement of the failed compressor on rooftop unit 2 at the Elm Street office (parts $3,420.00, labor 12 hours at $120.00 = $1,440.00). The unit cools the second floor, which was closed for two days.
Related invoice/PO #: Invoice BW-20417 dated April 10, 2026; PO 7731

## Supporting Documentation
- Brightwater HVAC invoice BW-20417 ($4,860.00, net 15, due April 25, 2026)
- Purchase order 7731, approved by phone by Linda Chen on April 8, 2026 and entered the same day
- Service report signed by the technician, with photos of the failed compressor
- Two written quotes for the job (Brightwater $4,860.00; Keystone Mechanical $5,575.00)

## Payment Method
[ ] Check  [x] Bank transfer  [ ] Other: ___
Bank details are on file in the vendor master for Brightwater HVAC (vendor no. 20918) and were verified by phone on March 2, 2026.

## Approval
Requested by: Daniel Okafor  Date: April 14, 2026
Approved by: Linda Chen, Controller  Date: April 15, 2026

*Attaching supporting documentation up front (not after someone asks) is what actually speeds up approval — an unsupported request is the most common reason a payment request sits unactioned.*`,
  },

  "notice-of-annual-general-meeting-template": {
    summary:
      "A community rowing club calls its annual general meeting 24 days ahead, with a five-item agenda, a dues cut-off for voting and a proxy deadline.",
    markdown: `# Notice of Annual General Meeting

**Lakeshore Community Rowing Club, Inc.**

Notice is hereby given that the Annual General Meeting will be held on Thursday, May 21, 2026, at 7:00 p.m., at the Lakeshore Boathouse, 1450 Harbor Drive, Madison, Wisconsin. Members who cannot attend in person may join by video; the link will be emailed to all members on May 19, 2026.

## Agenda
1. Approval of minutes from the previous AGM (May 22, 2025)
2. President's report on the 2025 season, including the new launch dock
3. Treasurer's report and approval of the financial statements for the year ended December 31, 2025
4. Election of three directors for two-year terms (candidates listed in the enclosed nomination sheet)
5. Proposal to raise the adult membership fee from $340 to $375 a year from January 1, 2027

## Eligibility to Vote
Members in good standing whose 2026 dues were paid by April 30, 2026. Junior members (under 18) may attend but do not vote.

## Proxy Voting
Members unable to attend may vote by proxy. Proxy forms must be submitted by Monday, May 18, 2026, 5:00 p.m., to the Club Secretary at the boathouse office or by email to secretary@lakeshorerowing.org. A member may hold no more than two proxies.

## Documents Available
The 2025 annual report, the financial statements, the minutes of the 2025 AGM and the nomination sheet are available in the members' area of the club website and as printed copies at the boathouse office from April 30, 2026.

---
By order of the Board,
Margaret Ellison, Club Secretary
April 27, 2026

*Meeting the required notice PERIOD (commonly 14-21 days minimum, varying by jurisdiction and bylaws) matters legally — a meeting called with insufficient notice can have its resolutions challenged.*`,
  },

  "request-for-quotation-template": {
    summary:
      "A craft brewery asks packaging suppliers to quote cans, lids, carriers and shipping cases for a summer production run, with a delivery date and dock hours.",
    markdown: `# Request for Quotation (RFQ)

**Issued by:** Hollis & Pike Craft Brewing Co.
**RFQ #:** HP-2026-014 · **Date:** June 2, 2026
**Quote deadline:** June 16, 2026, 5:00 p.m. Central Time

## Items Requested

| Item # | Description | Specification | Quantity |
|--------|-------------|-------------------|-----------|
| 1 | Aluminum beverage cans, 16 oz | Unprinted (bright), 202 end size, palletized, food-grade internal liner | 120,000 |
| 2 | Can ends (lids) | 202 size, standard opening, compatible with item 1 | 120,000 |
| 3 | 4-pack can carriers | Recyclable HDPE, black, fits 202 ends | 30,000 |
| 4 | Shipping cases | Corrugated, 24 cans (6 × 4-pack), 200 lb test, one-color print of supplied logo | 5,000 |

## Delivery Requirements
Delivery location: Hollis & Pike Craft Brewing Co., 2210 Foundry Street, Unit B, Grand Rapids, MI 49503 (loading dock at rear, open Monday to Friday, 7:00 a.m. to 3:00 p.m.)
Required delivery date: July 10, 2026; items 1 and 2 may arrive in two equal shipments, the second by July 24, 2026

## Quote Should Include
- Unit price and total price per item
- Delivery timeframe
- Payment terms offered
- Quote validity period
- Freight cost to Grand Rapids, shown separately
- Minimum order quantity and lead time for repeat orders

## Submission
Submit quotes to Sam Whitaker, Operations Manager, at purchasing@hollispikebrewing.com or (616) 555-0148 by June 16, 2026, 5:00 p.m. Central Time. Questions about the specifications are answered until June 9, 2026; all answers are shared with every supplier who received this RFQ.

*Unlike an RFP, an RFQ is used when the item/spec is already well-defined and price/delivery are the main deciding factors — if you're still figuring out the best approach, an RFP fits better.*`,
  },

  "expression-of-interest-letter-template": {
    summary:
      "An electrical contractor tells a city parks department it wants to bid on a trail lighting upgrade, with its municipal track record and a named contact.",
    markdown: `# Expression of Interest

February 3, 2026

Ms. Renee Alvarez, Procurement Officer
City of Fairhaven, Department of Parks and Recreation
200 Civic Center Plaza, Fairhaven, OR 97321

**RE: Expression of Interest — Riverside Park Trail Lighting Upgrade, RFEI No. 26-031**

Dear Ms. Alvarez,

Northgate Electrical Contractors, Inc. would like to express interest in the Riverside Park Trail Lighting Upgrade: replacing 64 sodium fixtures along the 2.3-mile trail with dark-sky compliant LED lighting and adding motion-dimming controls.

## Relevant Background
Northgate has served public clients in the Willamette Valley for 22 years from our base in Albany, Oregon. We hold an Oregon Construction Contractors Board license and a Limited Energy Technician license, and we carry $5 million in general liability coverage. Since 2020 we have completed lighting work in 14 municipal parks, including the 1.8-mile Calapooia Riverwalk in 2024, where we installed 52 LED fixtures with adaptive dimming and cut the city's energy use for that path by 61%. Our team for this project would be led by a licensed general supervising electrician with 18 years of outdoor lighting experience.

## Why We're Interested
The project matches the work we do most: trail and park lighting with low glare, close to waterways and in active public spaces. We have worked under the same environmental rules for riverside sites before, and we can schedule the work in phases so that most of the trail stays open to the public throughout construction.

## Next Steps
We would welcome the opportunity to discuss this further, or to submit a full proposal if invited to do so. We are also glad to attend the optional site walk listed for February 24, 2026.

Please contact Thomas Brennan, Vice President of Estimating, at tbrennan@northgate-electric.com or (541) 555-0172 with any questions.

Sincerely,
Thomas Brennan
Vice President of Estimating, Northgate Electrical Contractors, Inc.

*An EOI is meant to be lighter-weight than a full proposal — its job is to get you shortlisted or invited to the next stage, not to make the complete case.*`,
  },

  "simple-promissory-note-template": {
    summary:
      "A $12,000 loan between two people at 5% simple interest, repaid in 24 monthly payments of $526.46, with a 15-day default clause under Idaho law.",
    markdown: `# Promissory Note

**Principal Amount:** $12,000.00
**Date:** March 1, 2026

For value received, Marcus Hale, 418 Alder Lane, Boise, Idaho 83702 ("Borrower") promises to pay Diane Foster, 2275 Warm Springs Avenue, Boise, Idaho 83712 ("Lender") the principal sum of twelve thousand dollars ($12,000.00), together with interest as set out below.

## 1. Interest
5% per year, simple interest, calculated on the outstanding balance.

## 2. Repayment
Borrower will repay the full amount according to the following schedule: 24 monthly installments of $526.46 each, due on the 1st day of each month, starting April 1, 2026 and ending March 1, 2028. The final installment is adjusted to the exact remaining balance. Payments are made by bank transfer to the account Lender names in writing.

## 3. Prepayment
Borrower may repay all or part of the outstanding balance at any time without penalty.

## 4. Default
If any payment is more than 15 days late, the full remaining balance becomes due immediately at Lender's option, and may accrue interest at 8% per year until paid.

## 5. Governing Law
This note is governed by the laws of the State of Idaho.

---
Borrower: Marcus Hale  Date: March 1, 2026
Lender: Diane Foster  Date: March 1, 2026

*This document is provided for informational and educational purposes only and does not constitute legal or tax advice. Lending laws (including usury limits) vary by state/country — consult a licensed attorney for larger or commercial loans.*`,
  },

  "unemployment-benefits-appeal-letter-template": {
    summary:
      "A warehouse worker appeals a denial that called her layoff a voluntary quit, filed eight days after the determination, with the layoff notice and HR emails as evidence.",
    markdown: `# Unemployment Benefits Appeal Letter

July 8, 2026

Colorado Department of Labor and Employment
Unemployment Insurance Appeals, Denver, Colorado

**RE: Appeal of Determination — Claim #UI-2026-0481573, Jasmine Ortiz**

To Whom It May Concern,

I am writing to formally appeal the determination dated June 30, 2026, which denied my claim, on the following basis: the determination states that I quit my job at Pinecrest Home Furnishings, Inc. voluntarily and without good cause on May 29, 2026.

## Grounds for Appeal
I did not quit. I worked as a full-time warehouse associate at Pinecrest's Aurora distribution center from August 2022 until May 29, 2026. On May 1, 2026, Pinecrest gave every employee at the Aurora site written notice that the distribution center would close on May 29, 2026 and that all positions there would end. I was offered no position at another location. My last day was the day the site closed. My separation was a layoff because of the closure, not a resignation, and I believe the employer's response to the claims office recorded it under the wrong reason.

## Supporting Evidence
- Pinecrest's written closure and layoff notice dated May 1, 2026, addressed to me by name
- Email from Pinecrest Human Resources (Karen Liu, HR Generalist) dated May 27, 2026, confirming that my position ends with the closure and describing my final paycheck
- Final pay stub for the period ending May 29, 2026
- Written statement from my shift supervisor, Andre Fields, confirming that the whole Aurora team was laid off on the same day

I request that this determination be reversed and that my claim for benefits be approved. Please advise me of the date and process for any hearing related to this appeal.

Sincerely,
Jasmine Ortiz
Claimant ID 0481573 · 1187 Peoria Street, Apt. 4C, Aurora, CO 80011 · (720) 555-0193

*This document is provided for informational and educational purposes only and does not constitute legal advice. Unemployment appeals have strict, short deadlines (often 10-30 days from the determination date, varying by state) — file immediately, since missing the deadline typically forfeits the right to appeal at all.*`,
  },

  "insurance-cancellation-letter-template": {
    summary:
      "A policyholder cancels his auto policy after selling the car, picks an effective date that matches his new policy, and asks for the prorated refund in writing.",
    markdown: `# Insurance Policy Cancellation Letter

September 15, 2026

Summit Ridge Mutual Insurance Company
Policy Services, 900 Commerce Parkway, Columbus, OH 43215

**RE: Cancellation of Policy #AU-7782-31940**

Dear Summit Ridge Mutual Policy Services,

I am writing to request cancellation of my personal auto insurance policy, #AU-7782-31940, effective September 30, 2026 at 12:01 a.m.

## Reason (optional)
I sold the insured vehicle, a 2019 Honda CR-V, on September 12, 2026, and I am insuring my new vehicle with another company. That new policy starts on September 30, 2026 at 12:01 a.m., so there is no gap in coverage.

## Refund
My premium is paid through January 14, 2027. Please confirm whether any prorated premium refund is due for the unused portion of my policy, and the timeline for that refund. I would prefer the refund by direct deposit to the account the premium is drawn from.

## Confirmation Requested
Please send written confirmation of this cancellation, including the effective date, by mail to 3318 Kenwood Avenue, Cincinnati, OH 45213, or to the email address on file for this policy.

Thank you for your assistance.

Sincerely,
Robert Nguyen
Policy #AU-7782-31940 · (513) 555-0126

*Confirm your NEW policy is actually in effect before this cancellation takes effect (Section on Reason, if switching providers) — a gap between cancelling old coverage and the new policy starting can leave you uninsured, and in the case of auto or home insurance, may be required to be avoided by your lender or state law.*`,
  },

  "sustainability-report-template": {
    summary:
      "A 140-employee commercial printer reports a year of energy, emissions, waste and water figures against the year before, the projects behind the change and its targets for the next year.",
    markdown: `# Sustainability Report — Greenleaf Print & Packaging Co. 2025

## Overview
Greenleaf Print & Packaging is a commercial printer with 140 employees and one plant in Dayton, Ohio. In 2025 we cut our energy use by 8% and our Scope 1 and 2 emissions by 15% while printing 6% more volume than in 2024. This report covers January 1 to December 31, 2025, uses the same methods as our 2024 report, and was reviewed by our operations and finance leads before publication.

## Environmental Impact
| Metric | This Year | Last Year | Target |
|--------|-----------|-----------|--------|
| Energy consumption | 4,120 MWh | 4,480 MWh | 3,900 MWh (2026) |
| Carbon emissions (Scope 1 and 2) | 1,610 t CO2e | 1,890 t CO2e | 1,450 t CO2e (2026) |
| Waste diverted from landfill | 87% | 81% | 90% (2026) |
| Water usage | 6.2 million gallons | 6.9 million gallons | 5.8 million gallons (2026) |

## Initiatives This Year
- Commissioned a 650 kW rooftop solar array in August 2025; it produced 310 MWh in its first five months.
- Replaced 1,100 metal-halide and fluorescent fixtures in the plant with LED lighting on motion sensors.
- Moved two presses to low-VOC press washes and began recycling used wash solvent on site.
- Started a closed-loop program with our three largest customers to take back and recycle misprinted cartons.
- Raised the share of FSC-certified paper and board from 61% to 74% of purchases.

## Supply Chain
All 46 active material suppliers have signed our Supplier Code of Conduct, which covers labor standards, waste handling and responsible sourcing. In 2025 we audited our 20 largest suppliers, who account for 82% of spend. Three received corrective action plans (two for missing chain-of-custody documents, one for waste disposal records); all three closed their actions by November 2025.

## Goals Going Forward
- Reduce energy use to 3,900 MWh and Scope 1 and 2 emissions to 1,450 t CO2e in 2026.
- Divert 90% of production waste from landfill by the end of 2026.
- Reduce water use to 5.8 million gallons by repairing the chiller loop and reusing rinse water.
- Reach 85% FSC-certified paper and board by the end of 2027.
- Publish a first estimate of Scope 3 emissions from purchased paper in our 2026 report.

*Report metrics using a consistent methodology year over year — a metric that changes calculation method without disclosure looks like (or is) manipulation, even if unintentional.*`,
  },

  "due-diligence-checklist-template": {
    summary:
      "A buyer's checklist for acquiring a dental lab: every item answered, three still open, and a findings summary that names the customer concentration, a wage claim and a trademark held by the founder.",
    markdown: `# Due Diligence Checklist: Bayview Dental Lab, Inc.

**Prepared by:** Elena Petrov, Associate, Coastline Dental Partners · **Date:** October 6, 2026

## Financial
- [x] 3 years of financial statements reviewed: 2023 to 2025 reviewed statements plus 2026 year-to-date; revenue $4.8M in 2025, up from $4.1M in 2023
- [x] Tax returns reviewed: federal and California returns 2022 to 2025, no open audits
- [x] Accounts receivable/payable aging reviewed: $214,000 of receivables over 90 days, 72% of it from one customer
- [x] Debt and lease obligations identified: equipment loan of $380,000 (balance at closing to be paid off); building lease, see Other

## Legal
- [x] Corporate formation documents reviewed: incorporated in California in 2011; bylaws and share register complete
- [x] Material contracts reviewed: 11 customer and supplier contracts; two require consent to a change of control
- [x] Litigation history checked: no lawsuits; one pending wage claim with the California Labor Commissioner
- [ ] IP ownership confirmed: the "Bayview Smile" trademark is registered to the founder personally, not to the company

## Operational
- [x] Key customer concentration assessed: largest customer, a dental service organization, is 41% of 2025 revenue
- [x] Key employee retention risk assessed: two lead ceramists; retention bonuses proposed for both
- [x] Supplier dependencies identified: zirconia blanks from a single supplier; second source qualified in 2024

## HR
- [x] Employee agreements/handbook reviewed: 38 employees; handbook updated in 2025
- [ ] Outstanding HR complaints/claims checked: wage claim of $18,400 from a former technician, hearing set for November 18, 2026

## Other
- [x] Insurance coverage reviewed: general and product liability adequate; no cyber policy
- [ ] Real estate/lease obligations reviewed: lease ends June 30, 2027; landlord has not yet answered on a 5-year renewal

## Findings Summary
1. Customer concentration: 41% of revenue and 72% of overdue receivables come from one customer. Ask for a signed supply agreement of at least three years as a closing condition.
2. Trademark: the founder must assign the "Bayview Smile" trademark to the company before closing.
3. Wage claim: hold back $25,000 of the purchase price in escrow until the claim is decided.
4. Lease: closing depends on a signed renewal or a written renewal offer from the landlord.
5. Change of control: get written consent from the two counterparties before signing.

*A checklist only works if unchecked items get an actual answer before closing — "N/A" and "still pending" look identical on paper but mean very different things at closing.*`,
  },
};
