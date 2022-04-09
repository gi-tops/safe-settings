const NopCommand = require('../nopcommand')
const MergeDeep = require('../mergeDeep')
const ignorableFields = []
const previewHeaders = { accept: 'application/vnd.github.hellcat-preview+json,application/vnd.github.luke-cage-preview+json,application/vnd.github.zzzax-preview+json' }

module.exports = class Branches {
  constructor (nop, github, repo, settings, log) {
    this.github = github
    this.repo = repo
    this.branches = settings
    this.log = log
    this.nop = nop
  }
  sync () {
    const resArray = []
    //this.log(`Syncing branches ${JSON.stringify(this.branches)}`)
    return this.github.repos.get(this.repo).then((currentRepo) => {
      return Promise.all(
        this.branches
          .filter(branch => branch.protection !== undefined)
          .map(async (branch) => {
            let params = Object.assign(this.repo, { branch: branch.name })
            if (this.isEmpty(branch.protection)) {
              if (branch.name === 'default') {
                params = Object.assign(this.repo, { branch: currentRepo.data.default_branch })
                this.log(`Deleting default branch protection for branch ${currentRepo.data.default_branch}`)
              }
              if (this.nop) {
                resArray.concat([
                  new NopCommand(this.constructor.name, this.repo, this.github.repos.deleteBranchProtection.endpoint(params), "Delete Branch Protection"),
                ])
                return Promise.resolve(resArray)
              }
              return this.github.repos.deleteBranchProtection(params).catch(e => {return []})
            } else {
              if (branch.name === 'default') {
                params = Object.assign(this.repo, { branch: currentRepo.data.default_branch })
                this.log(`Setting default branch protection for branch ${currentRepo.data.default_branch}`)
              }

              if (this.nop) {
                try {
                  const result = await this.github.repos.getBranchProtection(params)
                  const mergeDeep = new MergeDeep(this.log,ignorableFields)
                  const results = JSON.stringify(mergeDeep.compareDeep(result.data, branch.protection),null,2)
                  this.log(`Result of compareDeep = ${results}`)
                  resArray.push(new NopCommand("Branch Protection", this.repo, null, `Followings changes will be applied to the branch protection for ${params.branch} branch = ${results}`))
                } catch(e){
                  this.log.error(e)
                }
              }
              Object.assign(params, branch.protection, { headers: previewHeaders })
              this.log(`Adding branch protection ${JSON.stringify(params)}`)
              if (this.nop) {
                resArray.push(
                  new NopCommand(this.constructor.name, this.repo, this.github.repos.updateBranchProtection.endpoint(params), "Add Branch Protection"),
                )
                return Promise.resolve(resArray)
              }
              try {
                const new_readme = `# ${this.repo.repo}

This file has been auto-generated.
`
                await this.github.repos.createOrUpdateFileContents({
                  owner: this.repo.owner,
                  repo: this.repo.repo,
                  branch: this.repo.branch,
                  path: 'README.md',
                  message: 'Creates branch set as the default in the config if no branch exists',
                  content: Buffer.from(new_readme).toString('base64')
                }).catch(e => {this.log(`Default Branch and README.md exists proceeding to Add Branch Protection`)})

                const res = await this.github.repos.updateBranchProtection(params)
                const message = `
# Safe-Settings Action summary

## :robot: Rules Applied:

@y-me-y - please note the following changes

Required Pull Request Reviews:

 - Required Approving Reviews Needed: ${this.repo.required_pull_request_reviews.required_approving_review_count}
 - Distmiss Stale Reviews: ${this.repo.required_pull_request_reviews.dismiss_stale_reviews}
 - Require Code Owner Reviews: ${this.repo.required_pull_request_reviews.require_code_owner_reviews}

Enforce Admins: ${this.repo.enforce_admins}

`
                await this.github.rest.issues.create({
                  owner: this.repo.owner,
                  repo: this.repo.repo,
                  title: 'Safe-settings applied via enforcer app',
                  body: message
                }).catch(e => {this.log.error(`Error creating comment ${e}`)})
                return this.log(`Branch protection applied successfully ${JSON.stringify(res.url)}`)
              } catch(e){
                return this.log(`Error applying branch protection ${JSON.stringify(e)}`)
              }
            }
          })
      )
    })
    .catch(e => {
      //this.log.error(` Error ${JSON.stringify(e)}`)
      if (e.status === 404) {
        return Promise.resolve([])
      }
    })

  }

  isEmpty (maybeEmpty) {
    return (maybeEmpty === null) || Object.keys(maybeEmpty).length === 0
  }
}
