# acai-ts

## Dependency Management

There are several recommended tools for managing dependencies in this project:

1. [dylang/npm-check](https://github.com/dylang/npm-check)
2. [raineorshine/npm-check-updates](https://github.com/raineorshine/npm-check-updates)

### Example Workflow

```bash
# From the project root
# Check to see if there are outdated dependencies
npm outdated
# Update root dependencies
npx npm-check -u

# Then in backend
cd ./packages/admin
npx npm-check -u

# Then in ui
cd ../ui
npx npm-check -u
```

You could also use the following command instead of npm-check:

```bash
npx npm-check-updates  --interactive --format group
```

## Repo Cleanup

Sometimes it necessary to clean up your local repo. To do so, follow these steps:

```bash
# From the project root
npx npkill

# Then run the clean script for the entire workspace
npm run clean --workspaces
```

Tool: [voidcosmos/npkill](https://github.com/voidcosmos/npkill)
