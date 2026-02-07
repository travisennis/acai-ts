---
name: update-architecture-document
description: Manage the ./ARCHITECTURE.md document for this pro...
user-invocable: true
---

Manage the ./ARCHITECTURE.md document for this project. If file doesn't exist create it. If it does exist make sure it is up-to-date and reflects the current state of the project.

When generating the project structure and file descriptions, ignore dot directories (directories starting with '.').

The main header of the document should be Acai Architecture.

Include a Project Structure that is the current directory tree for the entire project.

Next, there should be section called File Descriptions that should include a list of every file in the project and a brief description of what each is and does.

Finally, a section called Flow Diagram should document with mermaid diagrams the primary flows in the application, starting with the entry points defined in the package.json.
