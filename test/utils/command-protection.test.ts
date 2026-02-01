import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type BlockedCommandResult,
  detectDestructiveCommand,
  formatBlockedCommandMessage,
} from "../../source/utils/command-protection.ts";

describe("command-protection", () => {
  describe("detectDestructiveCommand", () => {
    describe("edge cases", () => {
      it("handles empty string", () => {
        const result = detectDestructiveCommand("");
        assert.strictEqual(result.blocked, false);
      });

      it("handles whitespace only", () => {
        const result = detectDestructiveCommand("   \n\t  ");
        assert.strictEqual(result.blocked, false);
      });

      it("handles mixed case commands", () => {
        const result = detectDestructiveCommand("GIT RESET --HARD");
        assert.strictEqual(result.blocked, true);
      });

      it("handles commands with leading/trailing whitespace", () => {
        const result = detectDestructiveCommand("  git reset --hard  ");
        assert.strictEqual(result.blocked, true);
      });
    });

    describe("destructive git commands", () => {
      it("blocks git reset --hard", () => {
        const result = detectDestructiveCommand("git reset --hard");
        assert.strictEqual(result.blocked, true);
        assert.ok((result as BlockedCommandResult).reason.includes("--hard"));
      });

      it("blocks git reset --hard with ref", () => {
        const result = detectDestructiveCommand("git reset --hard HEAD~5");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git reset --hard with commit hash", () => {
        const result = detectDestructiveCommand("git reset --hard abc123");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git reset --merge", () => {
        const result = detectDestructiveCommand("git reset --merge");
        assert.strictEqual(result.blocked, true);
        assert.ok((result as BlockedCommandResult).reason.includes("--merge"));
      });

      it("allows git reset --soft", () => {
        const result = detectDestructiveCommand("git reset --soft HEAD~1");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git reset --mixed", () => {
        const result = detectDestructiveCommand("git reset --mixed HEAD~1");
        assert.strictEqual(result.blocked, false);
      });

      it("blocks git checkout -- <file>", () => {
        const result = detectDestructiveCommand("git checkout -- src/index.ts");
        assert.strictEqual(result.blocked, true);
        assert.ok(
          (result as BlockedCommandResult).reason.includes("checkout --"),
        );
      });

      it("blocks git checkout -- with multiple files", () => {
        const result = detectDestructiveCommand(
          "git checkout -- file1.ts file2.ts",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("allows git checkout -b (creating branches)", () => {
        const result = detectDestructiveCommand("git checkout -b new-branch");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git checkout --orphan", () => {
        const result = detectDestructiveCommand(
          "git checkout --orphan new-branch",
        );
        assert.strictEqual(result.blocked, false);
      });

      it("allows git checkout branch-name", () => {
        const result = detectDestructiveCommand("git checkout main");
        assert.strictEqual(result.blocked, false);
      });

      it("blocks git restore without --staged", () => {
        const result = detectDestructiveCommand("git restore src/index.ts");
        assert.strictEqual(result.blocked, true);
        assert.ok(
          (result as BlockedCommandResult).reason.includes("git restore"),
        );
      });

      it("allows git restore --staged", () => {
        const result = detectDestructiveCommand(
          "git restore --staged src/index.ts",
        );
        assert.strictEqual(result.blocked, false);
      });

      it("allows git restore --staged with multiple files", () => {
        const result = detectDestructiveCommand(
          "git restore --staged file1.ts file2.ts",
        );
        assert.strictEqual(result.blocked, false);
      });

      it("blocks git clean -f", () => {
        const result = detectDestructiveCommand("git clean -f");
        assert.strictEqual(result.blocked, true);
        assert.ok((result as BlockedCommandResult).reason.includes("clean"));
      });

      it("blocks git clean --force", () => {
        const result = detectDestructiveCommand("git clean --force");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git clean -fd", () => {
        const result = detectDestructiveCommand("git clean -fd");
        assert.strictEqual(result.blocked, true);
      });

      it("allows git clean -n (dry run)", () => {
        const result = detectDestructiveCommand("git clean -n");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git clean --dry-run", () => {
        const result = detectDestructiveCommand("git clean --dry-run");
        assert.strictEqual(result.blocked, false);
      });

      it("blocks git push --force", () => {
        const result = detectDestructiveCommand("git push --force");
        assert.strictEqual(result.blocked, true);
        assert.ok((result as BlockedCommandResult).reason.includes("--force"));
      });

      it("blocks git push -f", () => {
        const result = detectDestructiveCommand("git push -f origin main");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git push --force with remote and branch", () => {
        const result = detectDestructiveCommand(
          "git push --force origin feature",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("allows git push --force-with-lease", () => {
        const result = detectDestructiveCommand(
          "git push --force-with-lease origin main",
        );
        assert.strictEqual(result.blocked, false);
      });

      it("blocks git branch -D", () => {
        const result = detectDestructiveCommand("git branch -D feature-branch");
        assert.strictEqual(result.blocked, true);
        assert.ok((result as BlockedCommandResult).reason.includes("-D"));
      });

      it("allows git branch -d (safe delete)", () => {
        const result = detectDestructiveCommand("git branch -d feature-branch");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git branch --delete", () => {
        const result = detectDestructiveCommand(
          "git branch --delete feature-branch",
        );
        assert.strictEqual(result.blocked, false);
      });

      it("blocks git stash drop", () => {
        const result = detectDestructiveCommand("git stash drop");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git stash drop with index", () => {
        const result = detectDestructiveCommand("git stash drop stash@{0}");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git stash clear", () => {
        const result = detectDestructiveCommand("git stash clear");
        assert.strictEqual(result.blocked, true);
      });

      it("allows git stash", () => {
        const result = detectDestructiveCommand("git stash");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git stash list", () => {
        const result = detectDestructiveCommand("git stash list");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git stash pop", () => {
        const result = detectDestructiveCommand("git stash pop");
        assert.strictEqual(result.blocked, false);
      });

      it("allows git stash apply", () => {
        const result = detectDestructiveCommand("git stash apply");
        assert.strictEqual(result.blocked, false);
      });

      it("allows safe git commands", () => {
        const safeCommands = [
          "git status",
          "git log",
          "git log --oneline",
          "git diff",
          "git diff HEAD~1",
          "git add src/index.ts",
          "git add .",
          "git commit -m 'test'",
          "git push origin main",
          "git pull origin main",
          "git fetch origin",
          "git merge feature",
          "git rebase main",
          "git cherry-pick abc123",
          "git show HEAD",
          "git blame file.ts",
        ];
        for (const cmd of safeCommands) {
          const result = detectDestructiveCommand(cmd);
          assert.strictEqual(result.blocked, false, `${cmd} should be safe`);
        }
      });
    });

    describe("dangerous rm -rf commands", () => {
      it("blocks rm -rf /home", () => {
        const result = detectDestructiveCommand("rm -rf /home");
        assert.strictEqual(result.blocked, true);
        assert.ok((result as BlockedCommandResult).reason.includes("rm -rf"));
      });

      it("blocks rm -rf /home/user", () => {
        const result = detectDestructiveCommand("rm -rf /home/user");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf /usr", () => {
        const result = detectDestructiveCommand("rm -rf /usr");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf /etc", () => {
        const result = detectDestructiveCommand("rm -rf /etc");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf /", () => {
        const result = detectDestructiveCommand("rm -rf /");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf ~", () => {
        const result = detectDestructiveCommand("rm -rf ~");
        assert.strictEqual(result.blocked, true);
      });

      it("allows rm -rf /tmp", () => {
        const result = detectDestructiveCommand("rm -rf /tmp");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf /tmp/*", () => {
        const result = detectDestructiveCommand("rm -rf /tmp/*");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf /tmp/somedir", () => {
        const result = detectDestructiveCommand("rm -rf /tmp/somedir");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf /tmp/my-test-*", () => {
        const result = detectDestructiveCommand("rm -rf /tmp/my-test-*");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf /var/tmp", () => {
        const result = detectDestructiveCommand("rm -rf /var/tmp");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf /var/tmp/*", () => {
        const result = detectDestructiveCommand("rm -rf /var/tmp/*");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf /var/tmp/somefile", () => {
        const result = detectDestructiveCommand("rm -rf /var/tmp/somefile");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf $TMPDIR", () => {
        const result = detectDestructiveCommand("rm -rf $TMPDIR");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf $TMPDIR/*", () => {
        const result = detectDestructiveCommand("rm -rf $TMPDIR/*");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf $TMPDIR/somedir", () => {
        const result = detectDestructiveCommand("rm -rf $TMPDIR/somedir");
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf with braced TMPDIR variable", () => {
        const tmpDirVar = "$" + "{TMPDIR}";
        const result = detectDestructiveCommand(`rm -rf ${tmpDirVar}`);
        assert.strictEqual(result.blocked, false);
      });

      it("allows rm -rf with braced TMPDIR variable and wildcard", () => {
        const tmpDirVar = "$" + "{TMPDIR}";
        const result = detectDestructiveCommand(`rm -rf ${tmpDirVar}/*`);
        assert.strictEqual(result.blocked, false);
      });

      it("handles rm without -rf (not blocked)", () => {
        const result = detectDestructiveCommand("rm /home/user/file.txt");
        assert.strictEqual(result.blocked, false);
      });

      it("handles rm -r without -f (not blocked by this check)", () => {
        const result = detectDestructiveCommand("rm -r /home/user/dir");
        assert.strictEqual(result.blocked, false);
      });
    });

    describe("inline scripts", () => {
      describe("bash -c", () => {
        it("blocks bash -c with git reset --hard", () => {
          const result = detectDestructiveCommand('bash -c "git reset --hard"');
          assert.strictEqual(result.blocked, true);
          assert.ok((result as BlockedCommandResult).reason.includes("bash"));
        });

        it("blocks bash -c with git clean -f", () => {
          const result = detectDestructiveCommand('bash -c "git clean -f"');
          assert.strictEqual(result.blocked, true);
        });

        it("allows bash -c with safe commands", () => {
          const result = detectDestructiveCommand('bash -c "git status"');
          assert.strictEqual(result.blocked, false);
        });

        it("allows bash -c with echo", () => {
          const result = detectDestructiveCommand('bash -c "echo hello"');
          assert.strictEqual(result.blocked, false);
        });
      });

      describe("sh -c", () => {
        it("blocks sh -c with destructive command", () => {
          const result = detectDestructiveCommand('sh -c "git reset --hard"');
          assert.strictEqual(result.blocked, true);
          assert.ok((result as BlockedCommandResult).reason.includes("sh"));
        });

        it("allows sh -c with safe command", () => {
          const result = detectDestructiveCommand('sh -c "ls -la"');
          assert.strictEqual(result.blocked, false);
        });
      });

      describe("python -c", () => {
        it("blocks python -c with git reset --hard", () => {
          const result = detectDestructiveCommand(
            "python -c \"import os; os.system('git reset --hard')\"",
          );
          assert.strictEqual(result.blocked, true);
          assert.ok((result as BlockedCommandResult).reason.includes("Python"));
        });

        it("blocks python3 -c with rm -rf /home", () => {
          const result = detectDestructiveCommand(
            "python3 -c \"import os; os.system('rm -rf /home')\"",
          );
          assert.strictEqual(result.blocked, true);
        });

        it("allows python -c with safe command", () => {
          const result = detectDestructiveCommand(
            "python -c \"print('hello')\"",
          );
          assert.strictEqual(result.blocked, false);
        });
      });

      describe("node -e", () => {
        it("blocks node -e with git clean -f", () => {
          const result = detectDestructiveCommand(
            "node -e \"require('child_process').execSync('git clean -f')\"",
          );
          assert.strictEqual(result.blocked, true);
        });

        it("allows node -e with safe command", () => {
          const result = detectDestructiveCommand(
            "node -e \"console.log('hello')\"",
          );
          assert.strictEqual(result.blocked, false);
        });
      });

      describe("ruby -e", () => {
        it("blocks ruby -e with destructive command", () => {
          const result = detectDestructiveCommand(
            'ruby -e "`git reset --hard`"',
          );
          assert.strictEqual(result.blocked, true);
        });

        it("allows ruby -e with safe command", () => {
          const result = detectDestructiveCommand("ruby -e \"puts 'hello'\"");
          assert.strictEqual(result.blocked, false);
        });
      });

      describe("perl -e", () => {
        it("blocks perl -e with destructive command", () => {
          const result = detectDestructiveCommand(
            "perl -e \"system('git reset --hard')\"",
          );
          assert.strictEqual(result.blocked, true);
        });

        it("allows perl -e with safe command", () => {
          const result = detectDestructiveCommand(
            'perl -e "print \\"hello\\n\\""',
          );
          assert.strictEqual(result.blocked, false);
        });
      });
    });

    describe("heredocs", () => {
      it("blocks heredoc with git reset --hard", () => {
        const result = detectDestructiveCommand(
          "cat <<EOF | bash\ngit reset --hard\nEOF",
        );
        assert.strictEqual(result.blocked, true);
        assert.ok(
          (result as BlockedCommandResult).reason
            .toLowerCase()
            .includes("heredoc"),
        );
      });

      it("blocks heredoc with git clean -f", () => {
        const result = detectDestructiveCommand(
          "bash <<SCRIPT\ngit clean -f\nSCRIPT",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("blocks heredoc with rm -rf /home", () => {
        const result = detectDestructiveCommand(
          'python <<PYEOF\nimport os\nos.system("rm -rf /home")\nPYEOF',
        );
        assert.strictEqual(result.blocked, true);
      });

      it("blocks heredoc with git push --force", () => {
        const result = detectDestructiveCommand(
          "cat <<END | sh\ngit push --force origin main\nEND",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("allows safe heredocs", () => {
        const result = detectDestructiveCommand("cat <<EOF\necho hello\nEOF");
        assert.strictEqual(result.blocked, false);
      });

      it("allows heredoc with safe git commands", () => {
        const result = detectDestructiveCommand(
          "cat <<EOF | bash\ngit status\ngit log\nEOF",
        );
        assert.strictEqual(result.blocked, false);
      });

      it("handles heredoc with quoted delimiter", () => {
        const result = detectDestructiveCommand(
          "cat <<'EOF'\ngit reset --hard\nEOF",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("handles heredoc with double-quoted delimiter", () => {
        const result = detectDestructiveCommand(
          'cat <<"EOF"\ngit reset --hard\nEOF',
        );
        assert.strictEqual(result.blocked, true);
      });

      it("handles heredoc with hyphen (<<-)", () => {
        const result = detectDestructiveCommand(
          "cat <<-EOF\n\tgit reset --hard\n\tEOF",
        );
        assert.strictEqual(result.blocked, true);
      });
    });

    describe("script content patterns", () => {
      it("blocks git reset --keep in heredoc", () => {
        const result = detectDestructiveCommand(
          "bash <<EOF\ngit reset --keep HEAD~1\nEOF",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("blocks git branch -D in heredoc", () => {
        const result = detectDestructiveCommand(
          "bash <<EOF\ngit branch -D feature\nEOF",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf with variable expansion in heredoc", () => {
        const result = detectDestructiveCommand(
          "bash <<EOF\nrm -rf $SOME_DIR\nEOF",
        );
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf /etc in heredoc", () => {
        const result = detectDestructiveCommand("bash <<EOF\nrm -rf /etc\nEOF");
        assert.strictEqual(result.blocked, true);
      });

      it("blocks rm -rf /var in heredoc", () => {
        const result = detectDestructiveCommand("bash <<EOF\nrm -rf /var\nEOF");
        assert.strictEqual(result.blocked, true);
      });
    });
  });

  describe("formatBlockedCommandMessage", () => {
    it("formats message with all required fields", () => {
      const result = detectDestructiveCommand("git reset --hard");
      assert.strictEqual(result.blocked, true);
      if (result.blocked) {
        const message = formatBlockedCommandMessage(result);
        assert.ok(message.includes("BLOCKED"));
        assert.ok(message.includes("Reason:"));
        assert.ok(message.includes("Command:"));
        assert.ok(message.includes("Tip:"));
      }
    });

    it("includes the original command", () => {
      const result = detectDestructiveCommand("git reset --hard HEAD~5");
      assert.strictEqual(result.blocked, true);
      if (result.blocked) {
        const message = formatBlockedCommandMessage(result);
        assert.ok(message.includes("git reset --hard HEAD~5"));
      }
    });

    it("includes helpful tip", () => {
      const result = detectDestructiveCommand("git reset --hard");
      assert.strictEqual(result.blocked, true);
      if (result.blocked) {
        const message = formatBlockedCommandMessage(result);
        assert.ok(message.includes("git stash"));
      }
    });

    it("formats rm -rf blocked message correctly", () => {
      const result = detectDestructiveCommand("rm -rf /home/user");
      assert.strictEqual(result.blocked, true);
      if (result.blocked) {
        const message = formatBlockedCommandMessage(result);
        assert.ok(message.includes("BLOCKED"));
        assert.ok(message.includes("/tmp"));
      }
    });

    it("formats inline script blocked message correctly", () => {
      const result = detectDestructiveCommand('bash -c "git reset --hard"');
      assert.strictEqual(result.blocked, true);
      if (result.blocked) {
        const message = formatBlockedCommandMessage(result);
        assert.ok(message.includes("Inline"));
        assert.ok(message.includes("bash"));
      }
    });
  });
});
