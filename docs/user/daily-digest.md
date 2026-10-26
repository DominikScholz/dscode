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

Every digest uses the same page: the project and date at the top, a headline next to the most
telling visual, **Highlights** with more screenshots from the threads or comparisons of their
numbers, **Threads** linking every thread that was active during the window, **What happened**
with one row per workstream, and **How to proceed** with the decisions only you can make and
ranked next steps. Each next step starts a new thread in that project and sends its prompt.
Digests show images and GIFs but not videos.

Describe what the digest should focus on under **Daily digest instructions**, such as what to put
first or which suggestions help you most. T3 Code always tells the agent to only investigate.

Choose the model under **Daily digest model**. It uses your permission mode for new threads.

## Read a digest

Digest threads hide the thread sidebar while open and show their page across the whole window.
The dashboard shows a newspaper button on each project with a digest; a dot means you have not
opened its newest digest since it finished. A digest is an ordinary thread, so you can reply to it,
settle it, or archive it.
