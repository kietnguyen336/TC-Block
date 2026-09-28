<p align="center">
  <img src="extension/icons/icon128.png" width="96" height="96" alt="TC-Block logo">
</p>

<h1 align="center">TC-Block</h1>

<p align="center">
  Hide spammy YouTube channels and help build a cleaner community filter.
</p>

## What TC-Block does

- Adds a channel-blocking button to YouTube.
- Hides videos, Shorts, and recommendations from blocked channels.
- Stops playback and covers the page when you open a blocked channel or one of its videos directly.
- Applies your personal blocks immediately.
- Lets you download a community block list reviewed by a moderator.
- Works without creating an account.

Community reports do not block a channel for everyone automatically. Only reviewed and approved channels are included in the shared filter.

## Install TC-Block

TC-Block is currently installed manually through Chrome's developer mode:

1. Select **Code → Download ZIP** on this GitHub page.
2. Extract the downloaded ZIP file.
3. Open `chrome://extensions` in Chrome.
4. Turn on **Developer mode** in the top-right corner.
5. Select **Load unpacked**.
6. Choose the `extension` folder inside the extracted project.
7. Pin TC-Block to the Chrome toolbar for quick access.

Reload any YouTube tabs that were already open after installing or updating the extension.

## Block a channel

1. Open a YouTube channel, video, or video list.
2. Select the TC-Block channel-blocking button.
3. Enter a short reason for the report.
4. Submit the report.

The channel is hidden on your browser immediately. Your report is also sent for community review, but it will not affect other users unless a moderator approves the channel.

## Sync the community filter

TC-Block syncs only when you ask it to. It does not download the community list automatically in the background.

1. Open the TC-Block popup.
2. Select **View blocked channels**.
3. Select **Sync now**.

The extension will download the latest approved community list. Reports waiting because of a previous connection problem will also be retried.

## View your blocked channels

Open the TC-Block popup and select **View blocked channels** to:

- See how many channels are currently filtered.
- Search by channel name, handle, or reason.
- Tell TC-Block to show a blocked channel again.
- Review and remove personal exceptions.
- Manually sync the community filter.

## Show a blocked channel again

Open **View blocked channels** and select the remove button next to a channel. TC-Block will create a personal exception so that channel remains visible on your browser, even if it is still included in the community filter.

To block it again, open the **Exceptions** section and remove the exception.

## How community review works

- A report hides the channel immediately for the person who submitted it.
- Multiple reports help moderators decide which channels should be reviewed first.
- Reaching the report threshold does not automatically block a channel for everyone.
- Only moderator-approved channels are published to the community filter.
- Users receive approved changes the next time they select **Sync now**.

## Frequently asked questions

### Why can another computer still see a channel I reported?

Personal blocks apply only to the browser that submitted the report. Other users receive the channel only after it has been reviewed, approved, and included in their next manual sync.

### Does TC-Block sync when Chrome starts?

No. Installing or reloading the extension, starting Chrome, opening the popup, and opening the blocked-channel page do not download the community list. Select **Sync now** when you want the latest list.

### Why is a blocked channel still visible?

Reload the YouTube tab and check whether the channel is listed under **Exceptions**. YouTube changes its layout regularly, so newly introduced page areas may require an extension update.

### Why does a report remain queued?

The report could not reach the service. Check your connection, open **View blocked channels**, and select **Sync now** to try again.

### Will reinstalling the extension keep my personal list?

Removing the extension or clearing its local data may remove personal blocks, exceptions, and unsent reports. Syncing restores only the approved community list.

## Report a problem

Open a [GitHub Issue](https://github.com/kietnguyen336/TC-Block/issues) and include:

- The YouTube page where the problem occurred.
- Clear steps to reproduce it.
- Your Chrome and TC-Block versions.
- A screenshot when it helps explain the issue.

Do not post private or sensitive information in a public issue.
