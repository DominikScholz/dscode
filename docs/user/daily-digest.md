# Daily digest

A daily digest is a page an agent writes for each project after you step away: what happened,
what is stuck, and next steps you can start with one click.

## Turn it on

Open **Settings → Daily Digest**, choose the environment that stays online, and turn on
**Daily digest**. Turn it on for one machine only; each environment writes its own digests.

Once no device has been connected to that environment for the delay you chose (8 hours by
default), T3 Code starts a digest thread in every project that changed since its last digest: a
thread had activity, or a local branch has new commits. A project without a digest yet looks back
one day. Connecting again restarts the wait, and a restart of the environment does too.

**Run now** writes digests right away, whether or not digests are on.

## Shape the digest

Describe the digest you want under **Daily digest instructions**: what comes first, how to lay
out the page, which suggestions help most. When empty, the digest opens with a short summary,
groups the work into shipped, in progress, and stuck, and ends with suggested next steps.

T3 Code always tells the agent to only investigate, to publish one page, and how to write links.
Each suggestion is a prompt link: clicking it starts a new thread in that project and sends the
prompt. Links to other threads open them in the app.

Choose the model under **Daily digest model**. It uses your permission mode for new threads.

## Read a digest

Digest threads hide the thread sidebar while open and show their page across the whole window.
The dashboard shows a newspaper button on each project with a digest; a dot means you have not
opened its newest digest since it finished. A digest is an ordinary thread, so you can reply to it,
settle it, or archive it.
