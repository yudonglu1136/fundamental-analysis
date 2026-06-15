# iOS Guru App Design QA

final result: passed

Source visual truth path:
`/var/folders/3k/0wsqd58n6w71n8tyql0t09fc0000gn/T/codex-clipboard-40a06dde-3bb8-4d17-bb63-ccce67d2eb2f.png`

Implementation screenshot path:
`/Users/yudonglu/Documents/fundamental-analysis/prototypes/ios-guru-app-design/qa/ios-design-board.png`

Viewport:
`1500x1100`

State:
Design-board overview with `Terminal Native` active, showing three iPhone
screens: Guru manager cockpit, Valuation quarterly model book, and Portfolio
holdings/dividend surface.

## Full-view comparison evidence

The source visual is the approved dark desktop terminal direction: compact
identity bar, dark cards, mint active state, manager avatar treatment, dense
data cards, central research workspace, and low-priority context moved away from
the main workflow. The implementation translates that direction into a mobile
design board rather than a pixel clone. It preserves the same visual language:
charcoal surfaces, thin slate borders, restrained radii, mint/amber/blue data
semantics, real generated manager avatars from the existing product assets, and
compact research modules.

The iOS hierarchy follows the confirmed brief: Guru is the first-release
primary tab, while DBMF, Valuation, and Portfolio remain bottom-tab peers.

## Focused region comparison evidence

- Manager identity: source uses a light circular AI portrait and compact
  manager metrics. Implementation uses the existing Bill Ackman generated
  avatar, firm label, AUM, holdings, and latest-quarter metrics inside the
  mobile manager cockpit.
- Research modules: source exposes Simulation, New Buys/Sells, and Quarterly
  Contribution. Implementation keeps those three modules in a thumb-sized
  segmented control.
- Chart language: source uses mint/amber/blue market-data lines. Implementation
  carries this into the simulation, valuation, and NAV chart surfaces.
- App Store design needs: implementation adds a storyboard row for the first
  iPhone screenshot pack and uses a GI monogram mark instead of the default
  Flutter icon.

## Findings

No actionable P0/P1/P2 issues remain.

## Patches made during QA

- Replaced the inherited Flutter app icon in the design board header with a GI
  monogram treatment.
- Updated the phone tab bar so each screen highlights its own active tab instead
  of always highlighting Guru.
- Added stable `data-testid` attributes for direction switching.
- Installed local Playwright dev dependency for repeatable prototype checks.

## Verification

- `npm run build` passed.
- Playwright screenshot capture passed and wrote `qa/ios-design-board.png`.
- Playwright interaction check passed:
  - `direction-cards` changes intro title to `研究卡片版`.
  - `direction-deep` changes intro title to `深挖流程版`.
  - Three phone frames render.

## Residual P3 polish

- This is a design direction board, not final iOS production UI. Once a
  direction is chosen, the selected flow should be expanded into full
  screen-by-screen App Store screenshots and Flutter iOS implementation specs.
