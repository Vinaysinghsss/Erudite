/**
 * @test class        : 
 * @description       : 
 * @author            : Sudip Karmakar
 * @last modified on  : 08-11-2025
 * @last modified by  : Sudip Karmakar
**/
// googleDriveAuthSetup.js
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import checkAndCreateAuthProvider from '@salesforce/apex/AuthProviderCreator.checkAndCreateAuthProvider';
import getConnectionStatus from '@salesforce/apex/AuthProviderCreator.getConnectionStatus';
import disconnectDrive from '@salesforce/apex/AuthProviderCreator.disconnectDrive';
import verifyGoogleDriveConnection from '@salesforce/apex/GoogleDriveService.verifyGoogleDriveConnection';
import verifyGoogleDriveClientCred from '@salesforce/apex/GoogleDriveService.VerifyGoogleDriveClientCred'; 

export default class GoogleDriveAuthSetup extends LightningElement {
    @track currentStep = 1;
    @track name = '';
    @track clientId = '';
    @track clientSecret = '';
    @track callbackUrl = '';
    @track isLoading = false;
    @track isVerifying = false;
    @track googleConsoleUrl = '';
    @track sessionId = '';
    @track vfPageReady = false;
    @track connectionStatus = {};
    @track showConnectionStatus = false;
    @track authProviderId = '';
    @track isAlreadyAuthProvider = false;
    wiredConnectionResult;

    steps = [
        { number: 1, title: 'Enter Credentials' },
        { number: 2, title: 'Google Console' },
        { number: 3, title: 'Salesforce Setup' }
    ];

    @wire(getConnectionStatus)
    wiredConnection(result) {
        this.wiredConnectionResult = result;
        if (result.data) {
            this.connectionStatus = result.data;
            this.showConnectionStatus = result.data.isConnected;
            
            // If already connected, show connection status instead of setup
            if (result.data.isConnected) {
                this.currentStep = 0; // Special step for connection status
            }
        } else if (result.error) {
            console.error('Error loading connection status:', result.error);
        }
    }

    get isConnectionStatus() { return this.currentStep === 0; }
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }

    get stepsWithState() {
        return this.steps.map((step, index) => ({
            ...step,
            cssClass: this.getStepClass(step.number),
            completed: step.number < this.currentStep,
            isLast: index === this.steps.length - 1
        }));
    }

    get vfPageUrl() {
        return '/apex/AuthProviderCreatorVF';
    }

    get isButtonDisabled() {
        return !this.clientId || !this.clientSecret || !this.vfPageReady || this.isLoading;
    }

    get googleCloudUrl() {
        if (this.connectionStatus.clientId) {
            return `https://console.cloud.google.com/apis/credentials/oauthclient/${this.connectionStatus.clientId}`;
        }
        return 'https://console.cloud.google.com/apis/credentials';
    }

    connectedCallback() {
        // Listen for messages from VF page
        window.addEventListener('message', this.handleVFMessage.bind(this));
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handleVFMessage.bind(this));
    }

    handleVFMessage(event) {
        if (event.data.type === 'VF_READY' || event.data.type === 'SESSION_ID_RESPONSE') {
            this.sessionId = event.data.sessionId;
            this.vfPageReady = true;
            console.log('Session ID received from VF page:', this.sessionId);
        }
    }

    getStepClass(stepNumber) {
        if (stepNumber < this.currentStep) return 'step completed';
        if (stepNumber === this.currentStep) return 'step active';
        return 'step';
    }

    handleInputChange(event) {
        const field = event.target.dataset.field;
        this[field] = event.target.value;
    }

    async handleGenerateCallback() {

        
        if ( !this.clientId || !this.clientSecret) {
            this.showToast('Error', 'Please fill in all fields', 'error');
            return;
        }

        if (!this.vfPageReady || !this.sessionId) {
            this.showToast('Error', 'Session not ready. Please wait a moment and try again.', 'error');
            return;
        }
        const prefix = 'Drive_';
        const shortClientId = this.clientId.substring(0, 5);
        this.name = `${prefix}${shortClientId}`;
        
        this.isLoading = true;
        try {
            const verifyResult = await verifyGoogleDriveClientCred({
            clientId: this.clientId,
            clientSecret: this.clientSecret
            });
         //alert('verifyResult>>>>'+JSON.stringify(verifyResult));
        if (verifyResult.status === 'Success') {
           // this.callbackUrl = verifyResult.callbackUrl;
            this.showToast('Success', 'Client verified successfully!', 'success');
        } else {
            this.showToast( 'Error','Authentication failed: Invalid Client ID or Client Secret. Please verify your credentials', 'error');
            return;
        }


            const result = await checkAndCreateAuthProvider({
                name: this.name,
                clientId: this.clientId,
                clientSecret: this.clientSecret,
                sessionId: this.sessionId
            });
            if(result == 'already exist'){
                 this.currentStep = 3;
                 this.isAlreadyAuthProvider = true;
            }else if (result) {
                this.callbackUrl = result;
                this.googleConsoleUrl = `https://console.cloud.google.com/auth/clients/${this.clientId}`;
                this.currentStep = 2;
                this.showToast('Success', 'Auth Provider created successfully!', 'success');
                this.isAlreadyAuthProvider = false;
                // Refresh connection status
                await refreshApex(this.wiredConnectionResult);
            } else {
                this.isAlreadyAuthProvider = false;
                this.showToast('Error', 'Failed to create Auth Provider', 'error');
            }
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCopyCallback() {
        navigator.clipboard.writeText(this.callbackUrl).then(() => {
            this.showToast('Success', 'Callback URL copied to clipboard!', 'success');
        }).catch(() => {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = this.callbackUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Success', 'Callback URL copied to clipboard!', 'success');
        });
    }

    handleOpenGoogleConsole() {
        window.open(this.googleConsoleUrl, '_blank');
        this.currentStep = 3;
    }

    handleOpenGoogleCloud() {
        window.open(this.googleCloudUrl, '_blank');
    }

    handleNextToSalesforce() {
        this.currentStep = 3;
    }

    handleOpenSalesforceSetup() {
        const baseUrl = window.location.origin;
        let salesforceSetupUrl = `${baseUrl}/lightning/setup/NamedCredential/home`;
        window.open(salesforceSetupUrl, '_blank');
    }

    async handleVerifyConnection() {
        this.isVerifying = true;
        
        try {
            const result = await verifyGoogleDriveConnection({isAlreadyAuthProvider : this.isAlreadyAuthProvider,authProviderName : this.name});
            
            if (result == 'Success') {
                this.showToast('Success', 'Authentication verified successfully! Connection is working.', 'success');
                
                // Wait a moment to show the success message, then reload
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
                
            } else {
                const errorMessage = result && result.error ? result.error : 'Authentication verification failed. Please complete the setup in Salesforce.';
                this.showToast('Error', errorMessage, 'error');
            }
        } catch (error) {
            const errorMessage = error.body?.message || error.message || 'Failed to verify connection. Please ensure you have completed all setup steps.';
            this.showToast('Error', errorMessage, 'error');
        } finally {
            this.isVerifying = false;
        }
    }

    async handleLogout() {
        this.isLoading = true;
        try {
            await disconnectDrive();
            this.showToast('Success', 'Successfully logged out from Google Drive', 'success');
            
            this.handleReset();
            this.currentStep = 1;
            this.showConnectionStatus = false;
            
            await refreshApex(this.wiredConnectionResult);
            window.location.reload();
        } catch (error) {
            this.showToast('Error', error.body?.message || error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleSetupNewConnection() {
        this.currentStep = 1;
        this.showConnectionStatus = false;
    }

    handleReset() {
        this.currentStep = 1;
        this.name = '';
        this.clientId = '';
        this.clientSecret = '';
        this.callbackUrl = '';
        this.googleConsoleUrl = '';
        this.isLoading = false;
        this.isVerifying = false;
        this.showConnectionStatus = false;
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ 
            title, 
            message, 
            variant,
            mode: variant === 'error' ? 'sticky' : 'dismissable'
        }));
    }
}