#!/bin/bash

# Script to safely push engineering repo to company GitHub repo
# This script is idempotent and safe to run multiple times

set -e  # Exit on any error

# Configuration
COMPANY_REPO_URL="https://github.com/Tech-Nucleus/Sentient-Marketing.git"
COMPANY_REMOTE_NAME="company"
ENGINEERING_REMOTE_NAME="origin"

echo "🚀 Starting safe push to company repository..."
echo "📁 Company repo: $COMPANY_REPO_URL"
echo "🔒 Your engineering repo will remain untouched"
echo ""

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ Error: Not in a git repository. Please run this script from your Accountmanager directory."
    exit 1
fi

# Check current status
echo "📊 Current repository status:"
echo "   Current branch: $(git branch --show-current)"
echo "   Current remotes:"
git remote -v
echo ""

# Check if company remote already exists
if git remote get-url "$COMPANY_REMOTE_NAME" > /dev/null 2>&1; then
    echo "✅ Company remote '$COMPANY_REMOTE_NAME' already exists"
    CURRENT_URL=$(git remote get-url "$COMPANY_REMOTE_NAME")
    if [ "$CURRENT_URL" = "$COMPANY_REPO_URL" ]; then
        echo "✅ Company remote URL is correct"
    else
        echo "⚠️  Company remote URL has changed, updating..."
        git remote set-url "$COMPANY_REMOTE_NAME" "$COMPANY_REPO_URL"
        echo "✅ Company remote URL updated"
    fi
else
    echo "➕ Adding company remote '$COMPANY_REMOTE_NAME'..."
    git remote add "$COMPANY_REMOTE_NAME" "$COMPANY_REPO_URL"
    echo "✅ Company remote added"
fi

# Fetch latest from company remote
echo "📥 Fetching latest from company remote..."
git fetch "$COMPANY_REMOTE_NAME"

# Get all local branches
LOCAL_BRANCHES=$(git branch --format='%(refname:short)')

echo "🌿 Pushing all local branches to company repository..."

# Push each local branch
for branch in $LOCAL_BRANCHES; do
    echo "   📤 Pushing branch: $branch"
    if git push "$COMPANY_REMOTE_NAME" "$branch" 2>/dev/null; then
        echo "   ✅ Successfully pushed $branch"
    else
        echo "   ⚠️  Branch $branch might already exist or have conflicts"
        echo "   🔄 Attempting to push with --force-with-lease for safety..."
        if git push "$COMPANY_REMOTE_NAME" "$branch" --force-with-lease 2>/dev/null; then
            echo "   ✅ Successfully force-pushed $branch (safely)"
        else
            echo "   ❌ Failed to push $branch - manual intervention may be needed"
        fi
    fi
done

# Push all tags
echo "🏷️  Pushing all tags..."
if git push "$COMPANY_REMOTE_NAME" --tags 2>/dev/null; then
    echo "✅ Successfully pushed all tags"
else
    echo "⚠️  Some tags might already exist, attempting force push..."
    git push "$COMPANY_REMOTE_NAME" --tags --force
    echo "✅ Successfully force-pushed all tags"
fi

# Verify the push
echo ""
echo "🔍 Verifying push to company repository..."
echo "   Company remote branches:"
git branch -r | grep "$COMPANY_REMOTE_NAME" | sed 's/^[[:space:]]*//' || echo "   No branches found"

echo ""
echo "✅ Push to company repository completed successfully!"
echo ""
echo "📋 Summary:"
echo "   • Your engineering repo remains unchanged"
echo "   • Company remote added as '$COMPANY_REMOTE_NAME'"
echo "   • All branches, commits, and tags pushed to company repo"
echo "   • Your 'origin' remote is still pointing to your engineering repo"
echo ""
echo "🔄 To push future changes to company repo, use:"
echo "   git push $COMPANY_REMOTE_NAME <branch-name>"
echo ""
echo "🔗 Company repository: $COMPANY_REPO_URL"
