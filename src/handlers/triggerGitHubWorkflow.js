// src/handlers/triggerGitHubWorkflow.js
import { callGitHubApi } from '../github.js';

export async function triggerGitHubWorkflow(env) {
    try {
        // Trigger the build-and-deploy workflow
        const response = await callGitHubApi(
            env, 
            '/actions/workflows/build-and-deploy.yml/dispatches',
            'POST',
            {
                ref: env.GITHUB_BRANCH || 'main'
            }
        );
        
        console.log('GitHub workflow triggered successfully');
        return { success: true, message: 'Build and deploy workflow triggered' };
    } catch (error) {
        console.error('Failed to trigger GitHub workflow:', error);
        return { success: false, message: error.message };
    }
}