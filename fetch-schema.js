#!/usr/bin/env node

// Script to fetch the latest GraphQL schema from Prismatic
// Usage: node fetch-schema.js

const fs = require('fs');
const https = require('https');

// Configuration
const ENDPOINT = process.env.PRISMATIC_ENDPOINT || 'https://app.ap-southeast-2.prismatic.io';
const TOKEN = process.env.PRISMATIC_TOKEN || '';

if (!TOKEN) {
    console.error('Error: Please set PRISMATIC_TOKEN environment variable');
    console.error('Example: PRISMATIC_TOKEN=your-token node fetch-schema.js');
    process.exit(1);
}

// GraphQL introspection query
const introspectionQuery = `
    query IntrospectionQuery {
        __schema {
            queryType { name }
            mutationType { name }
            subscriptionType { name }
            types {
                ...FullType
            }
            directives {
                name
                description
                locations
                args {
                    ...InputValue
                }
            }
        }
    }

    fragment FullType on __Type {
        kind
        name
        description
        fields(includeDeprecated: true) {
            name
            description
            args {
                ...InputValue
            }
            type {
                ...TypeRef
            }
            isDeprecated
            deprecationReason
        }
        inputFields {
            ...InputValue
        }
        interfaces {
            ...TypeRef
        }
        enumValues(includeDeprecated: true) {
            name
            description
            isDeprecated
            deprecationReason
        }
        possibleTypes {
            ...TypeRef
        }
    }

    fragment InputValue on __InputValue {
        name
        description
        type { ...TypeRef }
        defaultValue
    }

    fragment TypeRef on __Type {
        kind
        name
        ofType {
            kind
            name
            ofType {
                kind
                name
                ofType {
                    kind
                    name
                    ofType {
                        kind
                        name
                        ofType {
                            kind
                            name
                            ofType {
                                kind
                                name
                                ofType {
                                    kind
                                    name
                                }
                            }
                        }
                    }
                }
            }
        }
    }
`;

// Make the request
const data = JSON.stringify({
    query: introspectionQuery
});

const options = {
    hostname: new URL(ENDPOINT).hostname,
    path: '/api',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Length': data.length
    }
};

console.log(`Fetching schema from ${ENDPOINT}/api...`);

const req = https.request(options, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
        responseData += chunk;
    });

    res.on('end', () => {
        if (res.statusCode === 200) {
            try {
                const result = JSON.parse(responseData);
                
                if (result.errors) {
                    console.error('GraphQL errors:', result.errors);
                    process.exit(1);
                }
                
                // Save the schema
                const schemaPath = 'schema.json';
                fs.writeFileSync(schemaPath, JSON.stringify(result, null, 2));
                console.log(`✅ Schema saved to ${schemaPath}`);
                
                // Print some statistics
                const types = result.data.__schema.types;
                const queries = types.find(t => t.name === 'RootQuery')?.fields?.length || 0;
                const mutations = types.find(t => t.name === 'RootMutation')?.fields?.length || 0;
                
                console.log(`\nSchema statistics:`);
                console.log(`  - Types: ${types.length}`);
                console.log(`  - Queries: ${queries}`);
                console.log(`  - Mutations: ${mutations}`);
                
            } catch (error) {
                console.error('Error parsing response:', error);
                console.error('Response:', responseData);
                process.exit(1);
            }
        } else {
            console.error(`HTTP ${res.statusCode} error`);
            console.error('Response:', responseData);
            process.exit(1);
        }
    });
});

req.on('error', (error) => {
    console.error('Request error:', error);
    process.exit(1);
});

req.write(data);
req.end();