# Product

## Register

product

## Users

bitbones is for developers building Bitsocial clients and working on PKC or the Bitsocial React hooks. They use it to reproduce a bug, compare what two clients see, or test a library change against real communities. Contributors and community operators can use the same views to follow a publication, check whether a community is updating, or diagnose a connection problem.

## Product Purpose

bitbones works like browser devtools for Bitsocial. It connects the post or community on screen to the hook arguments, records, client states, and logs that explain it. Product changes should make it easier to follow that path from a visible symptom to concrete evidence another developer can reproduce.

The web app is a static client using hash routes. Its origin serves the application shell, and Bitsocial supplies the community and post data. The home feed uses Seedit's or 5chan's default community list from the shared Bitsocial lists repository. Its list switch makes that input visible and reproducible.

## Brand Personality

Use the voice of a developer tool. Labels are short, diagnostic terms come from the protocol, and UI copy makes the current state or available action clear. Keep the project name lowercase and use Bitsocial, PKC, and community consistently.

## Anti-references

The product scope is protocol inspection and reproduction. Keep engagement features, editorial feed curation, marketing presentation, and general-purpose analytics outside that scope. Use post and community interactions to exercise protocol behavior and keep the related evidence close to the action.

## Core Workflows

- **Reproduce a feed.** Open the home feed at `#/`, choose the list, sort, and time filter, then inspect the source communities and `useFeed` inputs and result.
- **Inspect a community, post, or reply.** Open a community by address or open a post at `#/<communityAddress>/comment/<cid>`. Read the community record and its client states. Use the verbose line for a quick comparison or select a record in the wide layout to inspect its fields, client activity, and JSON.
- **Check the network and configuration.** Open `#/stats` for period-based counts on default communities and subscriptions, loading states for the default list, and the schemes and hosts of configured client endpoints. Check the status bar for account, configured client counts, and versions.
- **Capture protocol logs.** Start recording at `#/log`, repeat the action, and filter the PKC and hooks output by namespace or search text. Recording is opt-in and its setting persists across reloads. A status bar link shows when recording is active.

## Design Principles

1. **Keep the hook visible.** Build thin views around the Bitsocial React hooks. Preserve the field names and state values a contributor needs to correlate UI evidence with source.
2. **Put the evidence next to the content.** Display enough context to scan a feed or thread. Make record fields, exact identifiers, and client states available on demand.
3. **Make incomplete states useful.** Show loading, retrying, failures, empty results, and update ages wherever they explain what a user is seeing.
4. **Make reproductions shareable.** Keep addressable views and copyable identifiers. Preserve redaction of client credentials and recognizable secret fields in diagnostic surfaces.
5. **Use the same interface for real protocol actions.** Publishing, voting, subscriptions, and challenges give developers concrete behavior to inspect.

## Accessibility & Inclusion

Keep diagnostics readable across themes. Preserve visible focus, labeled actions, keyboard access to inspection where available, and text cues for loading and failures. Keep browsing and navigation usable on smaller screens, where the layout prioritizes the main content and folds community context into a disclosure.

See [DESIGN.md](DESIGN.md) for visual and interaction guidance and [README.md](README.md) for setup and available platforms.
