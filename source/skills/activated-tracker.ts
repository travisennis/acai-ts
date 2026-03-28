/**
 * Tracks which skills have been activated in the current session.
 * Used to avoid re-injecting the same skill instructions multiple times.
 */
export class ActivatedSkillsTracker {
  private activatedSkills: Set<string> = new Set();

  has(skillName: string): boolean {
    return this.activatedSkills.has(skillName);
  }

  add(skillName: string): void {
    this.activatedSkills.add(skillName);
  }

  reset(): void {
    this.activatedSkills.clear();
  }
}
