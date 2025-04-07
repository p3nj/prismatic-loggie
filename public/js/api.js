// API configuration and interaction
const API = (() => {
    const API_ENDPOINT = 'https://app.ap-southeast-2.prismatic.io/api';
    const API_KEY = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Ik9FUXdRMEU1TkRNd01ETXhPRE5FUXpFNFJqWkJPVFZETWtVM1JEWTBOelZDTXpjNU9EWXhSQSJ9.eyJodHRwczovL3ByaXNtYXRpYy5pby9lbWFpbCI6ImJlbmphbWluLndhbmdAb2J6ZXJ2ci5jb20iLCJodHRwczovL3ByaXNtYXRpYy5pby9lbWFpbF92ZXJpZmllZCI6dHJ1ZSwiaHR0cHM6Ly9wcmlzbWF0aWMuaW8vbGFzdF9sb2dpbiI6IjIwMjUtMDQtMDdUMDA6MTI6MjYuMDM3WiIsImlzcyI6Imh0dHBzOi8vYXV0aC5wcmlzbWF0aWMuaW8vIiwic3ViIjoiYXV0aDB8NjcwYzk3YWZjZjNiNzMxNjBjMWY2NjU3IiwiYXVkIjpbImh0dHBzOi8vYXBwLmFwLXNvdXRoZWFzdC0yLnByaXNtYXRpYy5pby9hcGkiLCJodHRwczovL3ByaXNtYXRpYy1pby5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNzQzOTg0NzQ2LCJleHAiOjE3NDQwNzExNDYsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwgb2ZmbGluZV9hY2Nlc3MiLCJhenAiOiJHdEx2c0lackdGeGtac3d0VW96RlZyQ1NneUxHRjJuNCJ9.NE_7AiMAZ3wj9U3sX3GiN1JVfDAu1p3WWhqMb1WhNm7lpOF2XTzj9rACzR2oy8Bjw7XeKXsS0FVKTfvwilur5Y31x3L3OF65shPvdobRGeQNkZxcu9Awl9gRutf1rEpNoEMLIXxV_FFw6p8oJAfxOTAKFjtHhgels40Xau8xQTDRKzeXlv36HSnPIMayN3rJaRxNSug23kBsWDbtCbbr70EJqwS3M0vUqboBK474oQvqal5WQv1hRbLB3qaQHQD2R0HSjOBhqmDVMiH78qdlx1IUitaIgIlwh5mEhU65Sy1chwQDpO6NdrwUWrvl_RSGS0kkbudXUmstwF05Sn2hFg';

    // GraphQL query for execution results
    const executionResultQuery = `
        query QueryExecutionResult($id: ID!) {
            executionResult(id: $id) {
                id
                logs(orderBy: {direction: DESC, field: TIMESTAMP}) {
                    edges {
                        node {
                            id
                            stepName
                            message
                            loopStepName
                            loopStepIndex
                            loopPath
                            timestamp
                        }
                    }
                }
            }
        }
    `;

    // Fetch execution results from the API
    async function fetchExecutionResults(executionId) {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`
            },
            body: JSON.stringify({
                query: executionResultQuery,
                variables: {
                    id: executionId
                }
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.errors) {
            throw new Error(data.errors[0].message);
        }

        return data.data.executionResult;
    }

    // Return public methods
    return {
        fetchExecutionResults
    };
})();