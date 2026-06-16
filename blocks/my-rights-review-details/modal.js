import showToast from '../../scripts/toast/toast.js';
import { showGlobalModal, MODAL_CONTENT_TYPES } from '../../scripts/global-modal.js';

const REVIEW_COMMENTS_MODAL_ID = 'review-comments-modal-global';
const REVIEW_COMMENTS_API = '/api/rightsrequests/reviews/comments';
const COMMENT_REVIEWERS_API = '/api/rightsrequests/reviews/reviewers';
const COMMENT_MAX_LENGTH = 2000;

function getT(t) {
  if (typeof t === 'function') {
    return t;
  }
  return (_key, fallback) => fallback;
}

function formatCommentTimestamp(timestamp) {
  if (!timestamp) return 'N/A';
  const dateValue = new Date(timestamp);
  if (Number.isNaN(dateValue.getTime())) return 'N/A';
  const utcIso = dateValue.toISOString();
  return `${utcIso.slice(0, 19).replace('T', ' ')} UTC`;
}

function getCommentText(comment) {
  return String(comment?.comment || comment?.text || '').trim();
}

async function fetchReviewComments(requestId) {
  const response = await fetch(
    `${REVIEW_COMMENTS_API}?requestId=${encodeURIComponent(requestId)}`,
    { credentials: 'include' },
  );
  if (!response.ok) {
    throw new Error(`Failed to load comments (${response.status})`);
  }
  const result = await response.json();
  return result.data?.comments || [];
}

async function fetchCommentReviewers() {
  const response = await fetch(COMMENT_REVIEWERS_API, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to load reviewers (${response.status})`);
  }
  const result = await response.json();
  return (result.data || []).map((reviewer) => {
    const email = String(reviewer.email || '').toLowerCase();
    const fallbackName = email.split('@')[0] || email;
    return {
      email,
      name: reviewer.name || reviewer.displayName || fallbackName,
    };
  });
}

async function submitReviewComment(requestId, commentText, taggedReviewers) {
  const response = await fetch(REVIEW_COMMENTS_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      requestId,
      comment: commentText,
      taggedReviewers,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to add comment (${response.status})`);
  }
  const result = await response.json();
  return result.data || {};
}

function createCommentEntryElement(comment, currentUserEmail) {
  const entry = document.createElement('div');
  entry.className = 'review-comment-entry';
  if ((comment?.createdByEmail || '').toLowerCase() === currentUserEmail) {
    entry.classList.add('is-own-comment');
  }

  const meta = document.createElement('div');
  meta.className = 'review-comment-meta';
  const authorName = comment?.createdByName || comment?.createdByEmail || 'Unknown';
  const createdAt = formatCommentTimestamp(comment?.createdAt);
  meta.textContent = `${authorName} | ${createdAt}`;

  const message = document.createElement('div');
  message.className = 'review-comment-message';
  message.textContent = getCommentText(comment);

  entry.appendChild(meta);
  entry.appendChild(message);

  const taggedReviewers = Array.isArray(comment?.taggedReviewers)
    ? comment.taggedReviewers
    : [];
  if (taggedReviewers.length > 0) {
    const tags = document.createElement('div');
    tags.className = 'review-comment-tags';
    taggedReviewers.forEach((taggedReviewer) => {
      const chip = document.createElement('span');
      chip.className = 'review-comment-tag-chip';
      chip.textContent = `@${taggedReviewer.name || taggedReviewer.email}`;
      tags.appendChild(chip);
    });
    entry.appendChild(tags);
  }

  return entry;
}

function getActiveMentionToken(textArea) {
  const cursorPosition = textArea.selectionStart;
  const textBeforeCursor = textArea.value.slice(0, cursorPosition);
  const mentionMatch = /(^|\s)@([a-zA-Z0-9._-]*)$/.exec(textBeforeCursor);
  if (!mentionMatch) return null;

  const prefix = mentionMatch[1] || '';
  const mentionStart = textBeforeCursor.length - mentionMatch[0].length + prefix.length;
  return {
    query: (mentionMatch[2] || '').toLowerCase(),
    start: mentionStart,
    end: cursorPosition,
  };
}

export default function showReviewCommentsModal(request, tInput) {
  const t = getT(tInput);
  const requestId = request?.rightsRequestID;
  if (!requestId) {
    showToast(t('noRequestIdProvided', 'No request ID provided in URL.'), 'error');
    return null;
  }

  const contentNode = document.createElement('div');
  contentNode.className = 'review-comments-modal-content';

  const body = document.createElement('div');
  body.className = 'review-comments-modal-body';

  const metaRow = document.createElement('div');
  metaRow.className = 'review-comments-modal-meta-row';

  const subtitle = document.createElement('p');
  subtitle.className = 'review-comments-modal-subtitle';
  subtitle.textContent = `${t('requestIdLabel', 'Request ID:')} ${requestId}`;

  metaRow.appendChild(subtitle);

  const thread = document.createElement('div');
  thread.className = 'review-comments-thread';
  thread.textContent = t('loadingComments', 'Loading comments...');

  body.appendChild(metaRow);
  body.appendChild(thread);

  const composer = document.createElement('div');
  composer.className = 'review-comments-composer';

  const taggedContainer = document.createElement('div');
  taggedContainer.className = 'review-comments-tagged-reviewers';

  const commentInput = document.createElement('textarea');
  commentInput.className = 'review-comments-input';
  commentInput.rows = 3;
  commentInput.maxLength = COMMENT_MAX_LENGTH;
  commentInput.placeholder = t(
    'reviewCommentsPlaceholder',
    'Write a comment... Use @ to tag a rights manager.',
  );

  const mentionList = document.createElement('div');
  mentionList.className = 'review-comments-mention-list';

  const composerFooter = document.createElement('div');
  composerFooter.className = 'review-comments-composer-footer';

  const inputHint = document.createElement('span');
  inputHint.className = 'review-comments-input-hint';
  inputHint.textContent = t(
    'reviewCommentsInputHint',
    'Press Enter to send. Shift+Enter for a new line.',
  );

  const sendButton = document.createElement('button');
  sendButton.className = 'primary-button review-comments-send-button';
  sendButton.type = 'button';
  sendButton.textContent = t('send', 'Send');

  composerFooter.appendChild(inputHint);
  composerFooter.appendChild(sendButton);

  composer.appendChild(taggedContainer);
  composer.appendChild(commentInput);
  composer.appendChild(mentionList);
  composer.appendChild(composerFooter);

  contentNode.appendChild(body);
  contentNode.appendChild(composer);

  const currentUserEmail = (window.user?.email || '').toLowerCase();
  let comments = [];
  let reviewers = [];
  let mentionMatches = [];
  let isSending = false;
  let isRefreshing = false;
  let refreshButton = null;
  let refreshIcon = null;
  const selectedTaggedReviewers = new Map();

  const scrollThreadToBottom = () => {
    window.requestAnimationFrame(() => {
      thread.scrollTop = thread.scrollHeight;
    });
  };

  const renderComments = () => {
    thread.innerHTML = '';
    const sortedComments = [...comments].sort((firstComment, secondComment) => {
      const firstTime = Number(
        firstComment?.sortTimestamp || Date.parse(firstComment?.createdAt || ''),
      );
      const secondTime = Number(
        secondComment?.sortTimestamp || Date.parse(secondComment?.createdAt || ''),
      );
      return firstTime - secondTime;
    });

    if (sortedComments.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'review-comments-empty-state';
      emptyState.textContent = t(
        'reviewCommentsEmpty',
        'No comments yet. Start the conversation with a comment below.',
      );
      thread.appendChild(emptyState);
      return;
    }

    sortedComments.forEach((comment) => {
      thread.appendChild(createCommentEntryElement(comment, currentUserEmail));
    });
  };

  const setRefreshState = (isActive) => {
    if (!refreshButton) {
      return;
    }
    refreshButton.disabled = isActive;
    if (refreshIcon) {
      refreshIcon.classList.toggle('is-loading', isActive);
    }
    refreshButton.setAttribute(
      'aria-label',
      isActive ? t('refreshing', 'Refreshing...') : t('refresh', 'Refresh'),
    );
    refreshButton.title = isActive ? t('refreshing', 'Refreshing...') : t('refresh', 'Refresh');
  };

  const refreshComments = async (silent = false) => {
    if (isRefreshing) return;
    isRefreshing = true;
    setRefreshState(true);

    try {
      const latestComments = await fetchReviewComments(requestId);
      comments = Array.isArray(latestComments) ? latestComments : [];
      renderComments();
      scrollThreadToBottom();
    } catch (error) {
      if (!silent) {
        const failureMessage = t('failedToLoadComments', 'Failed to load comments: {0}')
          .replace('{0}', error.message);
        showToast(failureMessage, 'error');
      }
      if (silent) {
        throw error;
      }
    } finally {
      isRefreshing = false;
      setRefreshState(false);
    }
  };

  const hideMentionList = () => {
    mentionList.innerHTML = '';
    mentionList.classList.remove('is-visible');
    mentionMatches = [];
  };

  const renderTaggedReviewers = () => {
    taggedContainer.innerHTML = '';
    if (selectedTaggedReviewers.size === 0) return;

    const label = document.createElement('span');
    label.className = 'review-comments-tag-label';
    label.textContent = t('taggedReviewers', 'Tagged:');
    taggedContainer.appendChild(label);

    selectedTaggedReviewers.forEach((reviewer) => {
      const chip = document.createElement('span');
      chip.className = 'review-comments-tagged-chip';
      chip.textContent = `@${reviewer.name || reviewer.email}`;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'review-comments-tag-remove';
      removeButton.setAttribute('aria-label', t('remove', 'Remove'));
      removeButton.innerHTML = '&times;';
      removeButton.addEventListener('click', () => {
        selectedTaggedReviewers.delete(reviewer.email);
        renderTaggedReviewers();
      });

      chip.appendChild(removeButton);
      taggedContainer.appendChild(chip);
    });
  };

  const applyMentionSelection = (reviewer) => {
    const mentionToken = getActiveMentionToken(commentInput);
    if (!mentionToken) return;

    const mentionText = `@${reviewer.name || reviewer.email} `;
    const textBefore = commentInput.value.slice(0, mentionToken.start);
    const textAfter = commentInput.value.slice(mentionToken.end);
    commentInput.value = `${textBefore}${mentionText}${textAfter}`;

    const cursorPosition = textBefore.length + mentionText.length;
    commentInput.setSelectionRange(cursorPosition, cursorPosition);
    selectedTaggedReviewers.set(reviewer.email, reviewer);
    renderTaggedReviewers();
    hideMentionList();
    commentInput.focus();
  };

  const renderMentionList = () => {
    mentionList.innerHTML = '';
    if (mentionMatches.length === 0) {
      mentionList.classList.remove('is-visible');
      return;
    }

    mentionMatches.forEach((reviewer) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-comments-mention-item';
      button.textContent = `${reviewer.name} (${reviewer.email})`;
      button.addEventListener('click', () => applyMentionSelection(reviewer));
      mentionList.appendChild(button);
    });
    mentionList.classList.add('is-visible');
  };

  const refreshMentions = () => {
    const mentionToken = getActiveMentionToken(commentInput);
    if (!mentionToken) {
      hideMentionList();
      return;
    }

    mentionMatches = reviewers
      .filter((reviewer) => !selectedTaggedReviewers.has(reviewer.email))
      .filter((reviewer) => {
        const reviewerName = (reviewer.name || '').toLowerCase();
        return reviewerName.includes(mentionToken.query)
          || reviewer.email.includes(mentionToken.query);
      })
      .slice(0, 6);

    renderMentionList();
  };

  const sendComment = async () => {
    const commentText = commentInput.value.trim();
    if (!commentText || isSending) return;

    if (commentText.length > COMMENT_MAX_LENGTH) {
      const tooLongMsg = t(
        'reviewCommentTooLong',
        'Comment must be 2000 characters or less.',
      );
      showToast(tooLongMsg, 'error');
      return;
    }

    isSending = true;
    sendButton.disabled = true;
    sendButton.textContent = t('sending', 'Sending...');

    try {
      const taggedReviewers = Array.from(selectedTaggedReviewers.values())
        .map((reviewer) => ({
          email: reviewer.email,
          name: reviewer.name,
        }));

      const result = await submitReviewComment(requestId, commentText, taggedReviewers);
      comments = Array.isArray(result?.comments)
        ? result.comments
        : [...comments, result?.comment].filter(Boolean);

      commentInput.value = '';
      selectedTaggedReviewers.clear();
      renderTaggedReviewers();
      hideMentionList();
      renderComments();
      scrollThreadToBottom();
    } catch (error) {
      const failureMessage = t('failedToAddComment', 'Failed to add comment: {0}')
        .replace('{0}', error.message);
      showToast(failureMessage, 'error');
    } finally {
      isSending = false;
      sendButton.disabled = false;
      sendButton.textContent = t('send', 'Send');
      commentInput.focus();
    }
  };

  sendButton.addEventListener('click', sendComment);

  commentInput.addEventListener('input', refreshMentions);
  commentInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mentionList.classList.contains('is-visible')) {
      hideMentionList();
      event.stopPropagation();
      return;
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (mentionMatches.length > 0 && mentionList.classList.contains('is-visible')) {
        applyMentionSelection(mentionMatches[0]);
        return;
      }
      sendComment();
    }
  });

  const controls = showGlobalModal({
    id: REVIEW_COMMENTS_MODAL_ID,
    type: 'review-comments',
    title: t('reviewCommentsTitle', 'Rights Manager Comments'),
    width: '90%',
    maxWidth: '960px',
    height: '88vh',
    content: {
      type: MODAL_CONTENT_TYPES.NODE,
      node: contentNode,
      scrollable: false,
    },
    onOpen: ({ modal }) => {
      const modalBody = modal.querySelector('.global-modal-body');
      if (modalBody) {
        modalBody.style.padding = '0';
        modalBody.style.overflow = 'hidden';
      }

      const modalContent = modal.querySelector('.global-modal-content');
      if (modalContent) {
        modalContent.style.display = 'flex';
        modalContent.style.width = '100%';
        modalContent.style.height = '100%';
      }

      const header = modal.querySelector('.global-modal-header');
      const closeButton = modal.querySelector('.global-modal-close');
      if (header && closeButton) {
        const actions = document.createElement('div');
        actions.className = 'review-comments-modal-header-actions';

        refreshButton = document.createElement('button');
        refreshButton.type = 'button';
        refreshButton.className = 'review-comments-refresh-icon-button';
        refreshButton.setAttribute('aria-label', t('refresh', 'Refresh'));
        refreshButton.title = t('refresh', 'Refresh');

        refreshIcon = document.createElement('span');
        refreshIcon.className = 'review-comments-refresh-icon';
        refreshButton.appendChild(refreshIcon);

        refreshButton.addEventListener('click', () => {
          refreshComments();
        });

        closeButton.remove();

        actions.appendChild(refreshButton);
        actions.appendChild(closeButton);
        header.appendChild(actions);
      }
      commentInput.focus();
    },
    onClose: () => {
      hideMentionList();
      refreshButton = null;
      refreshIcon = null;
    },
  });

  Promise.all([
    fetchCommentReviewers(),
    refreshComments(true),
  ]).then(([reviewerList]) => {
    reviewers = Array.isArray(reviewerList) ? reviewerList : [];
    renderComments();
    scrollThreadToBottom();
    commentInput.focus();
  }).catch((error) => {
    const failureMessage = t('failedToLoadComments', 'Failed to load comments: {0}')
      .replace('{0}', error.message);
    showToast(failureMessage, 'error');
    comments = [];
    reviewers = [];
    renderComments();
  });

  return controls;
}
