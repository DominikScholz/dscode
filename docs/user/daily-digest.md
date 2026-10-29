# Daily digest

A daily digest is a page an agent writes for each project after you step away: what happened,
what is stuck, and next steps you can start with one click.

## Turn it on

Open **Settings → Daily Digest**, choose the environment that stays online, and turn on
**Daily digest**. Turn it on for one machine only; it keeps the digest threads locally.

Once no device has been connected to that environment for the delay you chose (8 hours by
default), T3 Code starts a digest thread in every project that changed since its last digest: a
thread had activity, or a local branch has new commits. A project without a digest yet looks back
one day. Connecting again restarts the wait, and a restart of the environment does too.

When you return after that delay, the digest agent also checks every project on other machines
available through its connected T3 tools. It starts a local digest thread for each changed
project, or each project without a digest yet. These threads include the project and machine
in their title. The discovery thread reports which machines it checked and any it could not
reach. Unavailable machines need to be online for a later check; **Run now** checks again.

**Run now** writes local digests and checks other machines right away, whether or not digests
are on. The selected provider needs access to the other machines' T3 tools. There are no separate
digest credentials or copies of remote conversations. Remote git details come from the threads.

## Shape the digest

Every digest uses the same short page: the project and date at the top, a headline, screenshots
from the threads or comparisons of their numbers, **What happened** with a line per workstream,
**What's next** with the decisions only you can make and ranked next steps, then the window's
activity and **Threads** linking every thread that was active during it. Each next step starts a
new thread in that project and sends its prompt.
Digests show images and GIFs but not videos.

Describe what the digest should focus on under **Daily digest instructions**, such as what to put
first or which suggestions help you most. T3 Code always tells the agent to only investigate.

Choose the model under **Daily digest model**. It uses your permission mode for new threads.

## Read a digest

Digest threads hide the thread sidebar while open and show their page across the whole window.
In the web and desktop apps everything on the page opens what it names: a thread opens it, a
changed file opens in the file panel, a commit or branch opens the project graph, a screenshot
opens full size, and each next step starts its thread.
The dashboard shows a newspaper button on each project with a digest; a dot means you have not
opened its newest digest since it finished. A digest is an ordinary thread, so you can reply to it,
settle it, or archive it.

Remote digests keep their thread links and next steps pointed at the source project. In web and
desktop, screenshots load from that machine when your app is connected to it. On mobile, use the
screenshot's **Open** link to view it in the source thread.
