const fs = require('fs');
const path = require('path');

const core = require('@actions/core');
const { Octokit } = require('@octokit/core');
const { paginateRest } = require('@octokit/plugin-paginate-rest');
const AdmZip = require('adm-zip');

const token = core.getInput("github_token", { required: true })
const [owner, repo] = core.getInput("repo", { required: true }).split("/")
const regex = core.getInput("regex", { required: true })
const path = core.getInput("path", { required: true })
const metadata = core.getInput("metadata", { required: false })

const OctoPag = Octokit.plugin(paginateRest);
const octokit = new OctoPag({ auth: token });

const apiVersion = '2022-11-28';
const headers = { 'X-GitHub-Api-Version': apiVersion };

async function main() {
  try {
    const artifacts = await listArtifacts(matchesRegexAndNotExpired);
    core.info(`==> got artifacts: ${artifacts.length} items:`);

    for (const artifact of artifacts) {
      await downloadArtifact(artifact);
    }

  if(metadata) {
    core.info(`saving artifacts JSON metadata to ${metadata}`);
    saveArtifactsJSON(metadata, artifacts);
  }

  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

function matchesRegexAndNotExpired(artifact) {
  return artifact.name.match(regex) && artifact.expired !== true;
}

async function listArtifacts(filterFunc) {
  const artifacts = await octokit.paginate(`GET /repos/${owner}/${repo}/actions/artifacts`, {
    per_page: 100,
    headers,
  });

  artifacts.forEach((artifact) => {
    core.info(
      `==> found artifact: id: ${artifact.id} name: ${artifact.name} size: ${artifact.size_in_bytes} branch: ${artifact.workflow_run.head_branch} expired: ${artifact.expired}`
    );
  });

  return artifacts.filter(filterFunc);
}

async function downloadArtifact(artifact) {
  core.info(
    ` - download> id: ${artifact.id} name: ${artifact.name} size: ${artifact.size_in_bytes} branch: ${artifact.workflow_run.head_branch} expired: ${artifact.expired}`
  );

  const artifactZip = await octokit.request(
    `GET /repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`,
    { headers }
  );

  const zip = new AdmZip(Buffer.from(artifactZip.data));
  zip.extractAllTo(`${path}/${artifact.id}`);
}

function saveArtifactsJSON(filePath, content) {
  // Create directory if it doesn't exists
  const dirPath = path.dirname(filePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  // Save content to the file
  fs.writeFileSync(
    filePath,
    JSON.stringify(content, null, 2)
  );
}

